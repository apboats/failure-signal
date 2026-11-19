import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { readEnv } from '../_shared/env.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/**
 * Finnhub quotes for every active US-listed bank; a session drop beyond
 * DROP_THRESHOLD_PCT becomes a stock_drop signal. Finnhub's free tier allows
 * 60 calls a minute, so the loop pauses for a minute before every 55th call.
 */
const PACE_MS = 100
const CALLS_PER_MINUTE_BUDGET = 55
const BUDGET_PAUSE_MS = 61_000
const DROP_THRESHOLD_PCT = -5

interface Institution {
  id: string
  name: string
  ticker: string
}

interface FinnhubQuote {
  c: number // Current price
  d: number | null // Change
  dp: number | null // Percent change
  h: number // High
  l: number // Low
  o: number // Open
  pc: number // Previous close
  t: number // Unix seconds of the quote
}

type QuoteResult =
  | { ok: true; quote: FinnhubQuote }
  | { ok: false; reason: 'http'; status: number }
  | { ok: false; reason: 'network'; message: string }
  | { ok: false; reason: 'empty' }

/** Trading-session date (America/New_York) that a quote timestamp belongs to. */
const NY_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  const finnhubKey = readEnv('FINNHUB_KEY')
  if (!finnhubKey) {
    console.error(
      '[market] FINNHUB_KEY is not set; set it with `supabase secrets set FINNHUB_KEY=...` and redeploy',
    )
    return json({ success: false, error: 'FINNHUB_KEY not set' }, 500)
  }

  try {
    const { institution_id } = await req
      .json()
      .catch(() => ({ institution_id: null }))

    let query = supabase
      .from('institutions')
      .select('id, name, ticker')
      .eq('is_active', true)
      .not('ticker', 'is', null)
    if (institution_id) query = query.eq('id', institution_id)

    const { data: institutions, error: institutionsError } = await query
    if (institutionsError) throw institutionsError

    // Dotted tickers (1398.HK, 601166.SS) are other exchanges, outside the
    // free tier. Two institution rows can share a ticker (SAN, UCB), so the
    // Set makes one call per ticker.
    const eligible = (institutions ?? []).filter(
      (inst): inst is Institution =>
        typeof inst.ticker === 'string' &&
        inst.ticker.length > 0 &&
        !inst.ticker.includes('.'),
    )
    const tickers = new Set(eligible.map((inst) => inst.ticker.toUpperCase()))

    const signals: Array<{
      institution: string
      ticker: string
      drop: number
      price: number
      session_date: string
    }> = []
    const failures: Array<{ ticker: string; reason: string }> = []
    let calls = 0
    let quoted = 0
    let deduped = 0

    for (const ticker of tickers) {
      if (calls > 0) await sleep(PACE_MS)
      if (++calls % CALLS_PER_MINUTE_BUDGET === 0) {
        console.log(
          `[market] ${calls} Finnhub calls this run; pausing ${BUDGET_PAUSE_MS} ms to stay under 60/min`,
        )
        await sleep(BUDGET_PAUSE_MS)
      }

      const result = await fetchFinnhubQuote(ticker, finnhubKey)
      if (!result.ok) {
        failures.push({ ticker, reason: describeFailure(result) })
        continue
      }
      quoted++

      const quote = result.quote
      const dailyChange = quote.dp
      if (
        typeof dailyChange !== 'number' ||
        !(dailyChange < DROP_THRESHOLD_PCT)
      ) {
        continue
      }

      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
      if (dailyChange < -30) severity = 'critical'
      else if (dailyChange < -15) severity = 'high'
      else if (dailyChange < -10) severity = 'medium'

      // Pre-open runs still see the previous session's quote, so the
      // dedupe keys on the session the quote belongs to, not on today.
      const sessionDate = sessionDateOf(quote.t)

      for (const inst of eligible) {
        if (inst.ticker.toUpperCase() !== ticker) continue

        const { data: existing, error: existingError } = await supabase
          .from('risk_signals')
          .select('id')
          .eq('institution_id', inst.id)
          .eq('category', 'stock_drop')
          .gte('signal_date', sessionDate)
          .limit(1)
        if (existingError) {
          console.error(
            `[market] dedupe lookup failed for ${ticker}: ${existingError.message}`,
          )
          continue
        }
        if (existing && existing.length > 0) {
          deduped++
          continue
        }

        const { error: insertError } = await supabase
          .from('risk_signals')
          .insert({
            institution_id: inst.id,
            category: 'stock_drop',
            severity,
            title: `Stock dropped ${Math.abs(dailyChange).toFixed(1)}% in one session`,
            description: `${ticker} at $${quote.c.toFixed(2)}, previous close $${quote.pc.toFixed(2)} (${dailyChange.toFixed(1)}%) in the ${sessionDate} session`,
            signal_value: dailyChange,
            signal_date: sessionDate,
            source: 'Finnhub',
          })
        if (insertError) {
          console.error(
            `[market] signal insert failed for ${ticker}: ${insertError.message}`,
          )
          continue
        }

        signals.push({
          institution: inst.name,
          ticker,
          drop: dailyChange,
          price: quote.c,
          session_date: sessionDate,
        })
      }
    }

    const summary = {
      tickers: tickers.size,
      calls,
      quoted,
      failed: failures.length,
      deduped,
      signals: signals.length,
    }

    if (tickers.size > 0 && quoted === 0) {
      console.error(
        `[market] no quote came back for any of ${tickers.size} tickers; check FINNHUB_KEY and the failures list`,
      )
      return json(
        { success: false, error: 'finnhub unavailable', ...summary, failures },
        502,
      )
    }

    return json({ success: true, ...summary, results: signals, failures })
  } catch (error) {
    console.error('[market] run failed:', error)
    return json({ success: false, error: String(error) }, 500)
  }
})

function describeFailure(result: Exclude<QuoteResult, { ok: true }>): string {
  switch (result.reason) {
    case 'http':
      return `HTTP ${result.status}`
    case 'network':
      return result.message
    case 'empty':
      return 'empty quote'
  }
}

/** YYYY-MM-DD in America/New_York for a Finnhub `t` (unix seconds); now when `t` is missing. */
function sessionDateOf(unixSeconds: number): string {
  const ms =
    Number.isFinite(unixSeconds) && unixSeconds > 0
      ? unixSeconds * 1000
      : Date.now()
  const parts = NY_DATE.formatToParts(new Date(ms))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * One quote. fetchWithRetry logs any non-OK status with a body prefix (the
 * label keeps the token out of the log) and retries once on 429 honouring
 * Retry-After, so a 401 from a bad key is never mistaken for an unknown
 * ticker.
 */
async function fetchFinnhubQuote(
  ticker: string,
  key: string,
): Promise<QuoteResult> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`

  let response: Response
  try {
    response = await fetchWithRetry(url, undefined, {
      retries: 1,
      label: `finnhub ${ticker}`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: 'network', message }
  }
  if (!response.ok) {
    return { ok: false, reason: 'http', status: response.status }
  }

  const data = (await response.json()) as Partial<FinnhubQuote>

  // Finnhub answers an unknown or delisted symbol with zeros, not an error.
  if (typeof data.c !== 'number' || data.c === 0) {
    console.warn(`[market] finnhub ${ticker}: empty quote (c=${data.c})`)
    return { ok: false, reason: 'empty' }
  }

  return { ok: true, quote: data as FinnhubQuote }
}
