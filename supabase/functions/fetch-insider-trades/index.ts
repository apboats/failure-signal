import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const SEC_USER_AGENT = `FailureSignal ${Deno.env.get("SEC_EDGAR_EMAIL") ?? "admin@failuresignal.app"}`

interface Form4Transaction {
  filerName: string
  filerTitle: string
  transactionType: string
  sharesTraded: number
  pricePerShare: number
  sharesRemaining: number
  transactionDate: string
  filingUrl: string
}

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

      // Throttle: SEC allows 10 req/sec, be conservative
      await new Promise((r) => setTimeout(r, 300))

      try {
        const trades = await fetchForm4Filings(inst.cik)
        const newTrades = []

        for (const trade of trades) {
          // Only care about sales by officers/directors
          if (trade.transactionType !== "S") continue

          // Deduplicate
          const { data: existing } = await supabase
            .from("insider_trades")
            .select("id")
            .eq("filing_url", trade.filingUrl)
            .limit(1)

          if (existing && existing.length > 0) continue

          await supabase.from("insider_trades").insert({
            institution_id: inst.id,
            filing_url: trade.filingUrl,
            filer_name: trade.filerName,
            filer_title: trade.filerTitle,
            transaction_type: trade.transactionType,
            shares_traded: trade.sharesTraded,
            price_per_share: trade.pricePerShare,
            shares_remaining: trade.sharesRemaining,
            transaction_date: trade.transactionDate,
            filing_date: new Date().toISOString().split("T")[0],
          })

          newTrades.push(trade)
        }

        // Generate signals based on insider selling patterns
        if (newTrades.length > 0) {
          await generateInsiderSignals(inst.id, inst.name)
        }

        results.push({ institution: inst.name, new_trades: newTrades.length })
      } catch (e) {
        console.error(`Error fetching insider trades for ${inst.name}:`, e)
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

async function fetchForm4Filings(cik: string): Promise<Form4Transaction[]> {
  const paddedCik = cik.padStart(10, "0")

  // Get recent filings from EDGAR submissions API
  const response = await fetch(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    { headers: { "User-Agent": SEC_USER_AGENT, "Accept": "application/json" } },
  )

  if (!response.ok) {
    console.error(`EDGAR API error for CIK ${cik}:`, response.status)
    return []
  }

  const data = await response.json()
  const recent = data.filings?.recent
  if (!recent) return []

  const trades: Form4Transaction[] = []
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  for (let i = 0; i < (recent.form?.length ?? 0); i++) {
    if (recent.form[i] !== "4") continue

    const filingDate = new Date(recent.filingDate[i])
    if (filingDate < sevenDaysAgo) continue

    const accession = recent.accessionNumber[i].replace(/-/g, "")
    const primaryDoc = recent.primaryDocument[i]
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${primaryDoc}`

    await new Promise((r) => setTimeout(r, 200))

    try {
      const xmlResponse = await fetch(filingUrl, {
        headers: { "User-Agent": SEC_USER_AGENT },
      })

      if (!xmlResponse.ok) continue

      const text = await xmlResponse.text()
      const parsed = parseForm4Xml(text, filingUrl)
      trades.push(...parsed)
    } catch {
      continue
    }
  }

  return trades
}

function parseForm4Xml(xml: string, filingUrl: string): Form4Transaction[] {
  const trades: Form4Transaction[] = []

  // Extract reporting person name
  const nameMatch = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/i)
  const filerName = nameMatch?.[1]?.trim() ?? "Unknown"

  // Extract title
  const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/i)
  const filerTitle = titleMatch?.[1]?.trim() ?? ""

  // Check if officer or director
  const isOfficer = /<isOfficer>(?:true|1)<\/isOfficer>/i.test(xml)
  const isDirector = /<isDirector>(?:true|1)<\/isDirector>/i.test(xml)
  if (!isOfficer && !isDirector) return trades

  // Extract non-derivative transactions
  const txnBlocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) ?? []

  for (const block of txnBlocks) {
    const codeMatch = block.match(/<transactionCode>([^<]+)<\/transactionCode>/i)
    const code = codeMatch?.[1]?.trim() ?? ""

    // S = sale, P = purchase
    if (code !== "S" && code !== "P") continue

    const sharesMatch = block.match(/<transactionShares>[\s\S]*?<value>([^<]+)<\/value>/i)
    const priceMatch = block.match(/<transactionPricePerShare>[\s\S]*?<value>([^<]+)<\/value>/i)
    const remainingMatch = block.match(/<sharesOwnedFollowingTransaction>[\s\S]*?<value>([^<]+)<\/value>/i)
    const dateMatch = block.match(/<transactionDate>[\s\S]*?<value>([^<]+)<\/value>/i)

    trades.push({
      filerName,
      filerTitle,
      transactionType: code,
      sharesTraded: parseFloat(sharesMatch?.[1] ?? "0"),
      pricePerShare: parseFloat(priceMatch?.[1] ?? "0"),
      sharesRemaining: parseFloat(remainingMatch?.[1] ?? "0"),
      transactionDate: dateMatch?.[1]?.trim() ?? new Date().toISOString().split("T")[0],
      filingUrl,
    })
  }

  return trades
}

async function generateInsiderSignals(institutionId: string, institutionName: string) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get all insider sales in the last 30 days
  const { data: recentSales } = await supabase
    .from("insider_trades")
    .select("*")
    .eq("institution_id", institutionId)
    .eq("transaction_type", "S")
    .gte("transaction_date", thirtyDaysAgo.toISOString().split("T")[0])

  if (!recentSales || recentSales.length === 0) return

  const distinctSellers = new Set(recentSales.map((s) => s.filer_name))
  const totalValue = recentSales.reduce(
    (sum, s) => sum + (Number(s.shares_traded) * Number(s.price_per_share)),
    0,
  )

  // Check for full liquidation (shares_remaining = 0)
  const fullLiquidation = recentSales.some((s) => Number(s.shares_remaining) === 0)

  let severity: "low" | "medium" | "high" | "critical" = "low"
  let title = ""

  if (fullLiquidation) {
    severity = "critical"
    title = `Executive fully liquidated position at ${institutionName}`
  } else if (distinctSellers.size >= 3) {
    severity = "critical"
    title = `${distinctSellers.size} insiders sold shares within 30 days at ${institutionName}`
  } else if (distinctSellers.size >= 2) {
    severity = "high"
    title = `${distinctSellers.size} insiders sold shares within 30 days at ${institutionName}`
  } else if (totalValue > 1000000) {
    severity = "medium"
    title = `Insider sold $${(totalValue / 1000000).toFixed(1)}M in shares at ${institutionName}`
  } else {
    severity = "low"
    title = `Insider selling detected at ${institutionName}`
  }

  // Avoid duplicate signals — check if we already created one today
  const today = new Date().toISOString().split("T")[0]
  const { data: existingSignal } = await supabase
    .from("risk_signals")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("category", "insider_selling")
    .gte("signal_date", today)
    .limit(1)

  if (existingSignal && existingSignal.length > 0) return

  const sellerNames = [...distinctSellers].join(", ")
  await supabase.from("risk_signals").insert({
    institution_id: institutionId,
    category: "insider_selling",
    severity,
    title,
    description: `${distinctSellers.size} insider(s) sold stock: ${sellerNames}. Total value: $${totalValue.toLocaleString()}. ${fullLiquidation ? "At least one executive fully liquidated their position." : ""}`,
    signal_value: totalValue,
    signal_date: new Date().toISOString(),
    source: "SEC EDGAR Form 4",
  })
}
