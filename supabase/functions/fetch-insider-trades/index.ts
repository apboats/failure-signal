import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { optionalEnv } from '../_shared/env.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Form 4 filings older than this are not re-read; the daily cron keeps up. */
const LOOKBACK_DAYS = 7
/** SEC fair-access limit is 10 requests/second; stay well under it. */
const PACE_BETWEEN_INSTITUTIONS_MS = 300
const PACE_BETWEEN_FILINGS_MS = 200

interface Form4Transaction {
  filerName: string
  filerTitle: string
  transactionType: string
  sharesTraded: number
  pricePerShare: number
  sharesRemaining: number
  transactionDate: string
  /** EDGAR filing date (YYYY-MM-DD) from the submissions index. */
  filingDate: string
  filingUrl: string
}

/**
 * `filings.recent` of https://data.sec.gov/submissions/CIK##########.json:
 * parallel arrays indexed by filing.
 */
interface EdgarRecentFilings {
  form?: string[]
  filingDate?: string[]
  accessionNumber?: string[]
  primaryDocument?: string[]
}

interface Form4Batch {
  /** Form 4 filings inside the lookback window. */
  filings: number
  transactions: Form4Transaction[]
}

interface StoreOutcome {
  inserted: number
  /** Sale lots dropped because their filing already stored one this run (filing_url is UNIQUE). */
  skippedSameFiling: number
  /** Sale lots whose filing was stored by an earlier run. */
  alreadyStored: number
}

type InstitutionResult =
  | ({ institution: string; filings: number; sales: number } & StoreOutcome)
  | { institution: string; error: string }

/**
 * EDGAR requires a contact address in the User-Agent. The placeholder keeps
 * the feed running but SEC may throttle it, so the fallback is logged once.
 */
function secUserAgent(): string {
  const email = optionalEnv(
    'SEC_EDGAR_EMAIL',
    'EDGAR User-Agent falls back to a placeholder contact; SEC may throttle or block requests without a real address',
  )
  return `FailureSignal ${email ?? 'admin@failuresignal.app'}`
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const userAgent = secUserAgent()

    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, name, ticker, cik')
      .eq('is_active', true)
      .not('cik', 'is', null)
    if (institutionsError) throw institutionsError

    const results: InstitutionResult[] = []

    for (const inst of institutions ?? []) {
      if (!inst.cik) continue

      await sleep(PACE_BETWEEN_INSTITUTIONS_MS)

      try {
        const batch = await fetchForm4Filings(inst.cik, userAgent)
        // Only sales by officers/directors feed the signal.
        const sales = batch.transactions.filter(
          (t) => t.transactionType === 'S',
        )
        const stored = await storeSales(inst.id, sales)

        if (stored.inserted > 0) {
          await generateInsiderSignals(inst.id, inst.name)
        }

        results.push({
          institution: inst.name,
          filings: batch.filings,
          sales: sales.length,
          ...stored,
        })
      } catch (e) {
        console.error(`[insider] ${inst.name} (CIK ${inst.cik}) failed:`, e)
        results.push({ institution: inst.name, error: String(e) })
      }
    }

    return json({
      success: true,
      institutions_with_cik: institutions?.length ?? 0,
      results,
    })
  } catch (error) {
    console.error('[insider] run failed:', error)
    return json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Stores one row per filing. `insider_trades.filing_url` is UNIQUE, so a
 * filing that reports several sale lots keeps only its first lot; the rest
 * are counted and logged until the (deferred) schema change adds a
 * per-transaction key.
 */
async function storeSales(
  institutionId: string,
  sales: Form4Transaction[],
): Promise<StoreOutcome> {
  const byFiling = new Map<string, Form4Transaction[]>()
  for (const sale of sales) {
    const lots = byFiling.get(sale.filingUrl) ?? []
    lots.push(sale)
    byFiling.set(sale.filingUrl, lots)
  }

  const outcome: StoreOutcome = {
    inserted: 0,
    skippedSameFiling: 0,
    alreadyStored: 0,
  }

  for (const [filingUrl, lots] of byFiling) {
    const { data: existing, error: existingError } = await supabase
      .from('insider_trades')
      .select('id')
      .eq('filing_url', filingUrl)
      .limit(1)
    if (existingError) {
      console.error(
        `[insider] dedupe lookup failed for ${filingUrl}: ${existingError.message}`,
      )
      continue
    }
    if (existing && existing.length > 0) {
      outcome.alreadyStored += lots.length
      continue
    }

    const first = lots[0]
    const { error: insertError } = await supabase
      .from('insider_trades')
      .insert({
        institution_id: institutionId,
        filing_url: first.filingUrl,
        filer_name: first.filerName,
        filer_title: first.filerTitle,
        transaction_type: first.transactionType,
        shares_traded: first.sharesTraded,
        price_per_share: first.pricePerShare,
        shares_remaining: first.sharesRemaining,
        transaction_date: first.transactionDate,
        filing_date: first.filingDate,
      })
    if (insertError) {
      console.error(
        `[insider] insert failed for ${filingUrl}: ${insertError.message}`,
      )
      continue
    }
    outcome.inserted++

    if (lots.length > 1) {
      outcome.skippedSameFiling += lots.length - 1
      console.warn(
        `[insider] ${filingUrl}: stored 1 of ${lots.length} sale lots; filing_url is UNIQUE so the other ${lots.length - 1} are dropped until the schema change`,
      )
    }
  }

  return outcome
}

async function fetchForm4Filings(
  cik: string,
  userAgent: string,
): Promise<Form4Batch> {
  const paddedCik = cik.padStart(10, '0')
  const empty: Form4Batch = { filings: 0, transactions: [] }

  // fetchWithRetry logs every non-OK status with a body prefix.
  const response = await fetchWithRetry(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    { headers: { 'User-Agent': userAgent, Accept: 'application/json' } },
    { label: `edgar submissions CIK ${cik}` },
  )
  if (!response.ok) return empty

  const data = await response.json()
  const recent: EdgarRecentFilings | undefined = data?.filings?.recent
  if (!recent?.form) return empty

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS)

  const batch: Form4Batch = { filings: 0, transactions: [] }

  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] !== '4') continue

    const filingDate = recent.filingDate?.[i]
    if (!filingDate || new Date(filingDate) < cutoff) continue

    const accession = recent.accessionNumber?.[i]?.replace(/-/g, '')
    const indexedDoc = recent.primaryDocument?.[i]
    if (!accession || !indexedDoc) continue

    // The submissions index points at the XSL-rendered HTML
    // (xslF345X06/doc4.xml). The raw XML the parser needs is the same path
    // without that first segment.
    const primaryDoc = indexedDoc.replace(/^xsl[^/]+\//, '')
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${primaryDoc}`
    batch.filings++

    await sleep(PACE_BETWEEN_FILINGS_MS)

    try {
      const xmlResponse = await fetchWithRetry(
        filingUrl,
        { headers: { 'User-Agent': userAgent } },
        { label: `edgar form 4 ${accession}` },
      )
      if (!xmlResponse.ok) continue

      const text = await xmlResponse.text()
      if (!/<ownershipDocument/i.test(text)) {
        const contentType =
          xmlResponse.headers.get('content-type') ?? 'unknown content type'
        console.warn(
          `[insider] ${filingUrl}: not a Form 4 XML document (${contentType}, ${text.length} chars); skipped`,
        )
        continue
      }

      batch.transactions.push(...parseForm4Xml(text, filingUrl, filingDate))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn(`[insider] ${filingUrl}: fetch failed: ${message}`)
    }
  }

  return batch
}

function parseForm4Xml(
  xml: string,
  filingUrl: string,
  filingDate: string,
): Form4Transaction[] {
  const trades: Form4Transaction[] = []

  // Extract reporting person name
  const nameMatch = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/i)
  const filerName = nameMatch?.[1]?.trim() ?? 'Unknown'

  // Extract title
  const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/i)
  const filerTitle = titleMatch?.[1]?.trim() ?? ''

  // Check if officer or director
  const isOfficer = /<isOfficer>(?:true|1)<\/isOfficer>/i.test(xml)
  const isDirector = /<isDirector>(?:true|1)<\/isDirector>/i.test(xml)
  if (!isOfficer && !isDirector) return trades

  // Extract non-derivative transactions
  const txnBlocks =
    xml.match(
      /<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi,
    ) ?? []

  for (const block of txnBlocks) {
    const codeMatch = block.match(
      /<transactionCode>([^<]+)<\/transactionCode>/i,
    )
    const code = codeMatch?.[1]?.trim() ?? ''

    // S = sale, P = purchase
    if (code !== 'S' && code !== 'P') continue

    const sharesMatch = block.match(
      /<transactionShares>[\s\S]*?<value>([^<]+)<\/value>/i,
    )
    const priceMatch = block.match(
      /<transactionPricePerShare>[\s\S]*?<value>([^<]+)<\/value>/i,
    )
    const remainingMatch = block.match(
      /<sharesOwnedFollowingTransaction>[\s\S]*?<value>([^<]+)<\/value>/i,
    )
    const dateMatch = block.match(
      /<transactionDate>[\s\S]*?<value>([^<]+)<\/value>/i,
    )

    trades.push({
      filerName,
      filerTitle,
      transactionType: code,
      sharesTraded: parseFloat(sharesMatch?.[1] ?? '0'),
      pricePerShare: parseFloat(priceMatch?.[1] ?? '0'),
      sharesRemaining: parseFloat(remainingMatch?.[1] ?? '0'),
      transactionDate: dateMatch?.[1]?.trim() ?? filingDate,
      filingDate,
      filingUrl,
    })
  }

  return trades
}

async function generateInsiderSignals(
  institutionId: string,
  institutionName: string,
) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get all insider sales in the last 30 days
  const { data: recentSales } = await supabase
    .from('insider_trades')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('transaction_type', 'S')
    .gte('transaction_date', thirtyDaysAgo.toISOString().split('T')[0])

  if (!recentSales || recentSales.length === 0) return

  const distinctSellers = new Set(recentSales.map((s) => s.filer_name))
  const totalValue = recentSales.reduce(
    (sum, s) => sum + Number(s.shares_traded) * Number(s.price_per_share),
    0,
  )

  // Check for full liquidation (shares_remaining = 0)
  const fullLiquidation = recentSales.some(
    (s) => Number(s.shares_remaining) === 0,
  )

  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  let title = ''

  if (fullLiquidation) {
    severity = 'critical'
    title = `Executive fully liquidated position at ${institutionName}`
  } else if (distinctSellers.size >= 3) {
    severity = 'critical'
    title = `${distinctSellers.size} insiders sold shares within 30 days at ${institutionName}`
  } else if (distinctSellers.size >= 2) {
    severity = 'high'
    title = `${distinctSellers.size} insiders sold shares within 30 days at ${institutionName}`
  } else if (totalValue > 1000000) {
    severity = 'medium'
    title = `Insider sold $${(totalValue / 1000000).toFixed(1)}M in shares at ${institutionName}`
  } else {
    severity = 'low'
    title = `Insider selling detected at ${institutionName}`
  }

  // Avoid duplicate signals: check if we already created one today
  const today = new Date().toISOString().split('T')[0]
  const { data: existingSignal } = await supabase
    .from('risk_signals')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('category', 'insider_selling')
    .gte('signal_date', today)
    .limit(1)

  if (existingSignal && existingSignal.length > 0) return

  const sellerNames = [...distinctSellers].join(', ')
  const { error } = await supabase.from('risk_signals').insert({
    institution_id: institutionId,
    category: 'insider_selling',
    severity,
    title,
    description: `${distinctSellers.size} insider(s) sold stock: ${sellerNames}. Total value: $${totalValue.toLocaleString()}. ${fullLiquidation ? 'At least one executive fully liquidated their position.' : ''}`,
    signal_value: totalValue,
    signal_date: new Date().toISOString(),
    source: 'SEC EDGAR Form 4',
  })
  if (error) {
    console.error(
      `[insider] signal insert failed for ${institutionName}: ${error.message}`,
    )
  }
}
