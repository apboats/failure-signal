import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.39"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

const SEC_USER_AGENT = `FailureSignal ${Deno.env.get("SEC_EDGAR_EMAIL") ?? "admin@failuresignal.app"}`

const ANALYSIS_PROMPT = `You are a financial analyst examining a bank's SEC quarterly filing (10-Q or 10-K) for early warning signs of institutional failure, based on patterns from the Silicon Valley Bank collapse.

Extract these specific values if present in the filing text:
- total_equity: Total stockholders' equity in millions USD
- unrealized_losses_afs: Unrealized losses on Available-for-Sale securities in millions USD (positive number for losses)
- unrealized_losses_htm: Unrealized losses on Held-to-Maturity securities in millions USD (positive number for losses)
- total_deposits: Total deposits in millions USD
- uninsured_deposits_pct: Percentage of deposits exceeding FDIC insurance limit (if disclosed)
- deposit_change_pct: Quarter-over-quarter change in total deposits (negative = decline)
- concentration_notes: Any mention of deposit concentration in specific industries/sectors

If a value is not found, use null. Return ONLY valid JSON, no markdown.`

Deno.serve(async () => {
  try {
    const { data: institutions } = await supabase
      .from("institutions")
      .select("id, name, ticker, cik")
      .eq("is_active", true)
      .not("cik", "is", null)

    const results = []

    for (const inst of institutions ?? []) {
      if (!inst.cik) continue

      await new Promise((r) => setTimeout(r, 500))

      try {
        const filing = await fetchLatest10Q(inst.cik)
        if (!filing) {
          results.push({ institution: inst.name, status: "no_new_filing" })
          continue
        }

        // Check if we already analyzed this filing
        const { data: existing } = await supabase
          .from("sec_filings")
          .select("id")
          .eq("filing_url", filing.url)
          .limit(1)

        if (existing && existing.length > 0) {
          results.push({ institution: inst.name, status: "already_analyzed" })
          continue
        }

        // Fetch filing text and extract relevant sections
        await new Promise((r) => setTimeout(r, 300))
        const filingText = await fetchFilingText(filing.url)

        if (!filingText) {
          results.push({ institution: inst.name, status: "could_not_fetch" })
          continue
        }

        // Truncate to relevant sections (~50K chars max for Claude)
        const relevantText = extractRelevantSections(filingText)

        // Claude analysis
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: ANALYSIS_PROMPT,
          messages: [
            {
              role: "user",
              content: `Analyze this SEC ${filing.type} filing for ${inst.name} (${inst.ticker}):\n\n${relevantText}`,
            },
          ],
        })

        let responseText = message.content[0].type === "text" ? message.content[0].text : ""
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

        const analysis = JSON.parse(responseText)

        // Store the filing analysis
        await supabase.from("sec_filings").insert({
          institution_id: inst.id,
          filing_type: filing.type,
          filing_url: filing.url,
          filing_date: filing.date,
          period_end: filing.periodEnd,
          total_equity: analysis.total_equity,
          unrealized_losses_afs: analysis.unrealized_losses_afs,
          unrealized_losses_htm: analysis.unrealized_losses_htm,
          uninsured_deposits_pct: analysis.uninsured_deposits_pct,
          total_deposits: analysis.total_deposits,
          raw_analysis: analysis,
          analyzed_at: new Date().toISOString(),
        })

        // Generate signals
        await generateFilingSignals(inst.id, inst.name, analysis)

        results.push({ institution: inst.name, status: "analyzed", analysis })
      } catch (e) {
        console.error(`Error processing filing for ${inst.name}:`, e)
        results.push({ institution: inst.name, error: String(e) })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

interface FilingInfo {
  url: string
  type: string
  date: string
  periodEnd: string | null
}

async function fetchLatest10Q(cik: string): Promise<FilingInfo | null> {
  const paddedCik = cik.padStart(10, "0")

  const response = await fetch(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    { headers: { "User-Agent": SEC_USER_AGENT, "Accept": "application/json" } },
  )

  if (!response.ok) return null

  const data = await response.json()
  const recent = data.filings?.recent
  if (!recent) return null

  // Find most recent 10-Q or 10-K
  for (let i = 0; i < (recent.form?.length ?? 0); i++) {
    const form = recent.form[i]
    if (form !== "10-Q" && form !== "10-K") continue

    const accession = recent.accessionNumber[i].replace(/-/g, "")
    const primaryDoc = recent.primaryDocument[i]

    return {
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${primaryDoc}`,
      type: form,
      date: recent.filingDate[i],
      periodEnd: recent.reportDate?.[i] ?? null,
    }
  }

  return null
}

async function fetchFilingText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT },
  })

  if (!response.ok) return null

  const html = await response.text()

  // Strip HTML tags for Claude analysis
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function extractRelevantSections(text: string): string {
  const keywords = [
    "available-for-sale", "held-to-maturity", "unrealized",
    "investment securities", "deposits", "uninsured",
    "stockholders' equity", "shareholders' equity",
    "liquidity", "capital ratio", "concentration",
  ]

  // Find sections containing our keywords and extract surrounding context
  const chunks: string[] = []
  const lowerText = text.toLowerCase()

  for (const keyword of keywords) {
    let idx = lowerText.indexOf(keyword)
    while (idx !== -1 && chunks.length < 20) {
      const start = Math.max(0, idx - 500)
      const end = Math.min(text.length, idx + 2000)
      chunks.push(text.slice(start, end))
      idx = lowerText.indexOf(keyword, idx + 1000)
    }
  }

  // Deduplicate overlapping chunks and limit total size
  const combined = [...new Set(chunks)].join("\n\n---\n\n")
  return combined.slice(0, 50000)
}

async function generateFilingSignals(
  institutionId: string,
  institutionName: string,
  analysis: {
    total_equity: number | null
    unrealized_losses_afs: number | null
    unrealized_losses_htm: number | null
    uninsured_deposits_pct: number | null
    total_deposits: number | null
    deposit_change_pct: number | null
    concentration_notes: string | null
  },
) {
  const signals: Array<{
    category: string
    severity: string
    title: string
    description: string
    signal_value: number | null
  }> = []

  // Unrealized losses vs equity ratio (SVB's key indicator)
  if (analysis.total_equity && (analysis.unrealized_losses_afs || analysis.unrealized_losses_htm)) {
    const totalLosses = (analysis.unrealized_losses_afs ?? 0) + (analysis.unrealized_losses_htm ?? 0)
    const ratio = (totalLosses / analysis.total_equity) * 100

    if (ratio > 90) {
      signals.push({
        category: "liquidity_warning",
        severity: "critical",
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity — SVB-pattern match`,
        description: `${institutionName}: $${totalLosses.toFixed(0)}M unrealized losses vs $${analysis.total_equity.toFixed(0)}M equity. SVB was at ~94% before collapse.`,
        signal_value: ratio,
      })
    } else if (ratio > 60) {
      signals.push({
        category: "liquidity_warning",
        severity: "high",
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity`,
        description: `${institutionName}: $${totalLosses.toFixed(0)}M unrealized losses vs $${analysis.total_equity.toFixed(0)}M equity.`,
        signal_value: ratio,
      })
    } else if (ratio > 30) {
      signals.push({
        category: "liquidity_warning",
        severity: "medium",
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity`,
        description: `${institutionName}: $${totalLosses.toFixed(0)}M unrealized losses vs $${analysis.total_equity.toFixed(0)}M equity.`,
        signal_value: ratio,
      })
    }
  }

  // Uninsured deposit concentration (SVB was 94%)
  if (analysis.uninsured_deposits_pct) {
    if (analysis.uninsured_deposits_pct > 90) {
      signals.push({
        category: "client_withdrawal",
        severity: "critical",
        title: `${analysis.uninsured_deposits_pct.toFixed(0)}% uninsured deposits — extreme run vulnerability`,
        description: `${institutionName} has ${analysis.uninsured_deposits_pct.toFixed(0)}% uninsured deposits. SVB had 94% uninsured at collapse.`,
        signal_value: analysis.uninsured_deposits_pct,
      })
    } else if (analysis.uninsured_deposits_pct > 80) {
      signals.push({
        category: "client_withdrawal",
        severity: "high",
        title: `${analysis.uninsured_deposits_pct.toFixed(0)}% uninsured deposits — high run vulnerability`,
        description: `${institutionName} has ${analysis.uninsured_deposits_pct.toFixed(0)}% of deposits exceeding FDIC insurance limits.`,
        signal_value: analysis.uninsured_deposits_pct,
      })
    }
  }

  // Deposit decline
  if (analysis.deposit_change_pct && analysis.deposit_change_pct < -5) {
    signals.push({
      category: "client_withdrawal",
      severity: analysis.deposit_change_pct < -15 ? "high" : "medium",
      title: `Deposits declined ${Math.abs(analysis.deposit_change_pct).toFixed(1)}% quarter-over-quarter`,
      description: `${institutionName} total deposits: $${analysis.total_deposits?.toFixed(0) ?? "?"}M. QoQ change: ${analysis.deposit_change_pct.toFixed(1)}%.`,
      signal_value: analysis.deposit_change_pct,
    })
  }

  // Insert all signals
  for (const signal of signals) {
    await supabase.from("risk_signals").insert({
      institution_id: institutionId,
      category: signal.category,
      severity: signal.severity,
      title: signal.title,
      description: signal.description,
      signal_value: signal.signal_value,
      signal_date: new Date().toISOString(),
      source: "SEC EDGAR 10-Q/10-K + Claude analysis",
    })
  }
}
