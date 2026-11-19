import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { fetchWithRetry } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Senate Stock Watcher data (GitHub, free, no auth). Both feeds have been
// returning 404; the run now reports that as a 502 instead of an empty
// success. Whether to adopt a maintained source is an owner decision.
const SENATE_DATA_URL =
  'https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/main/data/all_transactions.json'

// House Stock Watcher data
const HOUSE_DATA_URL =
  'https://raw.githubusercontent.com/timothycarambat/house-stock-watcher-data/main/data/all_transactions.json'

/** Trades disclosed (or, lacking a disclosure date, transacted) within this window count. */
const WINDOW_DAYS = 30

type Chamber = 'Senate' | 'House'

interface CongressionalTrade {
  transaction_date: string
  /** STOCK Act filing date, up to 45 days after the trade. Preferred for the window. */
  disclosure_date?: string
  owner?: string
  ticker: string
  asset_description?: string
  asset_type?: string
  type: string // "Sale" | "Sale (Partial)" | "Sale (Full)" | "Purchase"
  amount: string // "$1,001 - $15,000" etc.
  senator?: string
  representative?: string
  party?: string
  state?: string
  district?: string
}

interface SourceResult {
  chamber: Chamber
  /** HTTP status, or null when no response arrived (network error). */
  status: number | null
  ok: boolean
  trades: CongressionalTrade[]
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const senate = await fetchSource('Senate', SENATE_DATA_URL)
    const house = await fetchSource('House', HOUSE_DATA_URL)

    if (!senate.ok && !house.ok) {
      console.error(
        `[lawmaker] both sources unavailable (senate ${senate.status}, house ${house.status}); no trades processed`,
      )
      return json(
        {
          success: false,
          error: 'sources unavailable',
          senate_status: senate.status,
          house_status: house.status,
        },
        502,
      )
    }

    const sourceStatus = {
      senate_status: senate.status,
      house_status: house.status,
    }

    // Get monitored tickers
    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, name, ticker')
      .eq('is_active', true)
      .not('ticker', 'is', null)
    if (institutionsError) throw institutionsError

    if (!institutions || institutions.length === 0) {
      return json({ success: true, ...sourceStatus, results: [] })
    }

    const tickerMap = new Map<string, { id: string; name: string }>()
    for (const inst of institutions) {
      if (inst.ticker) {
        tickerMap.set(inst.ticker.toUpperCase(), {
          id: inst.id,
          name: inst.name,
        })
      }
    }

    const allTrades: Array<CongressionalTrade & { chamber: Chamber }> = [
      ...senate.trades.map((t) => ({ ...t, chamber: senate.chamber })),
      ...house.trades.map((t) => ({ ...t, chamber: house.chamber })),
    ]

    // Filter to our tickers, sales only, inside the window. Disclosures lag
    // trades by up to 45 days, so the disclosure date says whether a trade
    // is news; fall back to the transaction date when it is absent.
    const windowStart = new Date()
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS)

    const relevantTrades = allTrades.filter((t) => {
      if (!t.ticker) return false
      const ticker = normalizeTicker(t.ticker)
      if (!tickerMap.has(ticker)) return false

      const isSale = t.type?.toLowerCase().includes('sale')
      if (!isSale) return false

      const tradeDate = new Date(t.disclosure_date || t.transaction_date)
      if (isNaN(tradeDate.getTime()) || tradeDate < windowStart) return false

      return true
    })

    // Group by institution
    const tradesByInstitution = new Map<string, typeof relevantTrades>()
    for (const trade of relevantTrades) {
      const inst = tickerMap.get(normalizeTicker(trade.ticker))!
      const existing = tradesByInstitution.get(inst.id) ?? []
      existing.push(trade)
      tradesByInstitution.set(inst.id, existing)
    }

    const results = []

    for (const [institutionId, trades] of tradesByInstitution) {
      const inst = institutions.find((i) => i.id === institutionId)!
      const lawmakers = new Set(
        trades.map((t) => t.senator || t.representative || 'Unknown'),
      )

      // Parse estimated total value from amount ranges
      let estimatedTotal = 0
      for (const trade of trades) {
        estimatedTotal += parseAmountRange(trade.amount)
      }

      // Dedupe: check if we already have a signal for this institution today
      const today = new Date().toISOString().split('T')[0]
      const { data: existing, error: existingError } = await supabase
        .from('risk_signals')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('category', 'lawmaker_selling')
        .gte('signal_date', today)
        .limit(1)
      if (existingError) {
        console.error(
          `[lawmaker] dedupe lookup failed for ${inst.name}: ${existingError.message}`,
        )
        results.push({ institution: inst.name, error: existingError.message })
        continue
      }

      if (existing && existing.length > 0) {
        results.push({
          institution: inst.name,
          trades: trades.length,
          status: 'already_signaled',
        })
        continue
      }

      // Determine severity
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
      let title = ''

      const lawmakerNames = [...lawmakers].slice(0, 5).join(', ')
      const estimated = formatAmount(estimatedTotal)

      if (lawmakers.size >= 4) {
        severity = 'critical'
        title = `${lawmakers.size} lawmakers sold ${inst.ticker} stock in 30 days`
      } else if (lawmakers.size >= 3) {
        severity = 'high'
        title = `${lawmakers.size} lawmakers sold ${inst.ticker} stock in 30 days`
      } else if (lawmakers.size >= 2 || estimatedTotal > 100000) {
        severity = 'medium'
        title = `${lawmakers.size} lawmaker(s) sold ${inst.ticker} stock, est. ${estimated}`
      } else {
        severity = 'low'
        title = `Lawmaker sold ${inst.ticker} stock`
      }

      const chambers = [...new Set(trades.map((t) => t.chamber))].join(', ')
      const { error: insertError } = await supabase
        .from('risk_signals')
        .insert({
          institution_id: institutionId,
          category: 'lawmaker_selling',
          severity,
          title,
          description: `Congressional stock sales for ${inst.name} (${inst.ticker}) disclosed in the last ${WINDOW_DAYS} days: ${trades.length} transaction(s) by ${lawmakers.size} lawmaker(s): ${lawmakerNames}. Estimated total value: ${estimated}. Chambers: ${chambers}. STOCK Act disclosures can lag up to 45 days.`,
          signal_value: estimatedTotal,
          signal_date: new Date().toISOString(),
          source: 'Congressional STOCK Act disclosures',
        })
      if (insertError) {
        console.error(
          `[lawmaker] signal insert failed for ${inst.name}: ${insertError.message}`,
        )
        results.push({ institution: inst.name, error: insertError.message })
        continue
      }

      results.push({
        institution: inst.name,
        trades: trades.length,
        lawmakers: lawmakers.size,
        severity,
        estimated_value: estimatedTotal,
      })
    }

    return json({ success: true, ...sourceStatus, results })
  } catch (error) {
    console.error('[lawmaker] run failed:', error)
    return json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Fetches one chamber's feed. Every outcome is logged with its status so a
 * dead URL shows up in the function log instead of as an empty success.
 */
async function fetchSource(
  chamber: Chamber,
  url: string,
): Promise<SourceResult> {
  try {
    // fetchWithRetry logs non-OK responses with a body prefix.
    const response = await fetchWithRetry(url, undefined, {
      label: `${chamber} disclosures`,
    })
    console.log(`[lawmaker] ${chamber} source responded ${response.status}`)
    if (!response.ok) {
      return { chamber, status: response.status, ok: false, trades: [] }
    }

    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      console.error(`[lawmaker] ${chamber} source returned a non-array body`)
      return { chamber, status: response.status, ok: false, trades: [] }
    }

    return {
      chamber,
      status: response.status,
      ok: true,
      trades: body as CongressionalTrade[],
    }
  } catch (e) {
    console.error(`[lawmaker] ${chamber} source fetch failed:`, e)
    return { chamber, status: null, ok: false, trades: [] }
  }
}

function normalizeTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/\s+/g, '')
}

function parseAmountRange(amount: string): number {
  if (!amount) return 0
  // Ranges like "$1,001 - $15,000" or "$50,001 - $100,000"
  const matches = amount.match(/\$?([\d,]+)/g)
  if (!matches || matches.length === 0) return 0

  // Use the midpoint of the range
  const values = matches
    .map((m) => parseInt(m.replace(/[$,]/g, ''), 10))
    .filter((n) => !isNaN(n))
  if (values.length >= 2) return (values[0] + values[1]) / 2
  if (values.length === 1) return values[0]
  return 0
}

/** Dollar amount with a currency prefix: $1.2M, $85K, $500. */
function formatAmount(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount.toString()}`
}
