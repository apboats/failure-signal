import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/**
 * StockTwits bearish share per bank. Every active US-listed bank is scanned
 * each run; a reading counts only once enough messages carry a sentiment tag,
 * so a thin stream (5 of 8 tagged bearish) never fires. A trailing baseline
 * per ticker is deferred until a social_snapshots table exists.
 */

/** Sentiment-tagged messages needed before the bearish share means anything. */
const MIN_TAGGED = 20
/** Bearish share (percent of tagged messages) above which a signal fires. */
const BEARISH_PCT_THRESHOLD = 75
/** Share at or above which the signal is high instead of medium. */
const BEARISH_PCT_HIGH = 90
/** Pages of up to 30 messages read per ticker while tagged < MIN_TAGGED. */
const MAX_PAGES = 3
/** Delay between StockTwits requests; the unauthenticated limit is 200/hour per IP. */
const PACE_MS = 500
/** Stop starting new tickers after this much wall clock, before the runtime limit ends the run. */
const DEADLINE_MS = 120_000
/** One signal per institution per window unless the reading got materially worse. */
const DEDUPE_WINDOW_HOURS = 24
const DEDUPE_WORSE_BY_PCT = 10

interface StockTwitsMessage {
  id: number
  created_at?: string
  entities?: { sentiment?: { basic?: string } | null } | null
}

interface StockTwitsPage {
  messages?: StockTwitsMessage[]
  cursor?: { more?: boolean; max?: number }
}

interface Reading {
  tagged: number
  bearish: number
  /** Bearish share of tagged messages, percent with one decimal. */
  pct: number
  /** Messages read, tagged or not. */
  sampled: number
  /** created_at of the oldest message read (ISO): the start of the measured window. */
  since: string | null
}

type StockTwitsResult =
  | { status: 'ok'; reading: Reading }
  | { status: 'insufficient'; tagged: number; sampled: number }
  | { status: 'http'; httpStatus: number }
  | { status: 'network'; message: string }

type SignalOutcome = 'inserted' | 'below_threshold' | 'deduped' | 'error'

interface ScanRow {
  institution: string
  ticker: string
  status: SignalOutcome | 'insufficient' | 'unavailable' | 'skipped'
  tagged?: number
  bearish?: number
  pct?: number
  sampled?: number
  http_status?: number
  detail?: string
}

interface ScannableInstitution {
  id: string
  name: string
  ticker: string
}

type StopReason = 'rate_limited' | 'deadline'

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  const startedAt = Date.now()

  try {
    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, name, ticker')
      .eq('is_active', true)
      .not('ticker', 'is', null)
      .order('ticker')
    if (institutionsError) throw institutionsError

    // StockTwits covers US listings; dotted tickers (1398.HK) are other exchanges.
    const scannable = (institutions ?? []).filter(
      (inst): inst is ScannableInstitution =>
        typeof inst.ticker === 'string' &&
        inst.ticker.length > 0 &&
        !inst.ticker.includes('.'),
    )

    // Rotate the start so a run that hits the deadline or a 429 does not
    // starve the same tail of the list every time (runs every 2 hours).
    const ordered = rotate(scannable, Math.floor(startedAt / 7_200_000))

    const results: ScanRow[] = []
    // Two institution rows can share a ticker (SAN, UCB): fetch each once.
    const byTicker = new Map<string, StockTwitsResult>()
    let fetched = 0
    let failed = 0
    let fired = 0
    let skipped = 0
    let stopReason: StopReason | null = null

    for (const inst of ordered) {
      const ticker = inst.ticker.toUpperCase()

      if (stopReason === null && Date.now() - startedAt > DEADLINE_MS) {
        stopReason = 'deadline'
        console.warn(
          `[social] ${DEADLINE_MS} ms deadline reached after ${byTicker.size} tickers; the rest are skipped this run`,
        )
      }
      if (stopReason !== null && !byTicker.has(ticker)) {
        skipped++
        results.push({
          institution: inst.name,
          ticker,
          status: 'skipped',
          detail: stopReason,
        })
        continue
      }

      let result = byTicker.get(ticker)
      if (result === undefined) {
        if (byTicker.size > 0) await sleep(PACE_MS)
        result = await fetchStockTwits(ticker)
        byTicker.set(ticker, result)

        if (result.status === 'ok' || result.status === 'insufficient') {
          fetched++
        } else {
          failed++
        }
        if (result.status === 'http' && result.httpStatus === 429) {
          stopReason = 'rate_limited'
          console.warn(
            '[social] StockTwits returned 429; stopping the scan for this run',
          )
        }
      }

      switch (result.status) {
        case 'ok': {
          const outcome = await maybeSignal(inst, ticker, result.reading)
          if (outcome === 'inserted') fired++
          results.push({
            institution: inst.name,
            ticker,
            status: outcome,
            tagged: result.reading.tagged,
            bearish: result.reading.bearish,
            pct: result.reading.pct,
            sampled: result.reading.sampled,
          })
          break
        }
        case 'insufficient':
          results.push({
            institution: inst.name,
            ticker,
            status: 'insufficient',
            tagged: result.tagged,
            sampled: result.sampled,
          })
          break
        case 'http':
          results.push({
            institution: inst.name,
            ticker,
            status: 'unavailable',
            http_status: result.httpStatus,
          })
          break
        case 'network':
          results.push({
            institution: inst.name,
            ticker,
            status: 'unavailable',
            detail: result.message,
          })
          break
      }
    }

    const summary = {
      institutions: ordered.length,
      tickers: byTicker.size,
      fetched,
      failed,
      fired,
      skipped,
      stop_reason: stopReason,
      elapsed_ms: Date.now() - startedAt,
    }

    if (fetched === 0 && failed > 0) {
      console.error(
        `[social] StockTwits unavailable for every ticker tried (${failed}); nothing scanned`,
      )
      return json(
        {
          success: false,
          error: 'stocktwits unavailable',
          ...summary,
          results,
        },
        502,
      )
    }

    return json({ success: true, ...summary, results })
  } catch (error) {
    console.error('[social] run failed:', error)
    return json({ success: false, error: String(error) }, 500)
  }
})

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return items
  const offset = seed % items.length
  return [...items.slice(offset), ...items.slice(0, offset)]
}

/**
 * Reads the symbol stream newest-first, paging with `max=<oldest id>` until
 * MIN_TAGGED sentiment-tagged messages are in hand or MAX_PAGES is reached.
 * Messages are deduplicated by id so the cursor's inclusive/exclusive
 * semantics cannot double count. Any non-OK response is logged and returned
 * as `http`, distinct from a stream that is merely too thin.
 */
async function fetchStockTwits(ticker: string): Promise<StockTwitsResult> {
  const seen = new Set<number>()
  let tagged = 0
  let bearish = 0
  let sampled = 0
  let since: string | null = null
  let max: number | undefined

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PACE_MS)

    const url = new URL(
      `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
    )
    if (max !== undefined) url.searchParams.set('max', String(max))

    let response: Response
    try {
      // retries: 0 keeps the helper's non-OK log line; a 429 ends the run
      // instead of waiting on Retry-After for every remaining ticker.
      response = await fetchWithRetry(
        url,
        { headers: { Accept: 'application/json' } },
        { retries: 0, label: `stocktwits ${ticker} page ${page}` },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn(`[social] stocktwits ${ticker} page ${page}: ${message}`)
      return { status: 'network', message }
    }

    if (!response.ok) {
      console.warn(
        `[social] stocktwits ${ticker} page ${page}: HTTP ${response.status}`,
      )
      return { status: 'http', httpStatus: response.status }
    }

    const body = (await response.json()) as StockTwitsPage
    const messages = body.messages ?? []
    if (messages.length === 0) break

    let oldestId = Number.POSITIVE_INFINITY
    for (const message of messages) {
      if (typeof message.id !== 'number' || seen.has(message.id)) continue
      seen.add(message.id)
      sampled++
      oldestId = Math.min(oldestId, message.id)

      const basic = message.entities?.sentiment?.basic
      if (basic === 'Bearish' || basic === 'Bullish') {
        tagged++
        if (basic === 'Bearish') bearish++
      }

      // ISO 8601 timestamps order lexically.
      if (
        message.created_at &&
        (since === null || message.created_at < since)
      ) {
        since = message.created_at
      }
    }

    if (tagged >= MIN_TAGGED) break
    if (body.cursor?.more === false) break

    // Pages are newest-first, so older pages are not busier. Stop when even
    // twice the tag rate seen so far could not reach MIN_TAGGED by MAX_PAGES
    // (after page 1 that is 3 or fewer tagged of 30); it keeps ~59 tickers
    // at 500 ms pacing inside the deadline without changing any reading
    // that could have fired.
    const projected = (tagged / page) * MAX_PAGES * 2
    if (projected < MIN_TAGGED) break

    const nextMax = body.cursor?.max ?? oldestId
    if (!Number.isFinite(nextMax) || (max !== undefined && nextMax >= max)) {
      break
    }
    max = nextMax
  }

  if (tagged < MIN_TAGGED) return { status: 'insufficient', tagged, sampled }

  return {
    status: 'ok',
    reading: {
      tagged,
      bearish,
      pct: Math.round((bearish / tagged) * 1000) / 10,
      sampled,
      since,
    },
  }
}

/**
 * Inserts a social_panic signal when the reading clears the threshold and no
 * signal in the dedupe window already recorded a share within
 * DEDUPE_WORSE_BY_PCT points of it.
 */
async function maybeSignal(
  inst: ScannableInstitution,
  ticker: string,
  reading: Reading,
): Promise<SignalOutcome> {
  if (reading.pct <= BEARISH_PCT_THRESHOLD) return 'below_threshold'

  const windowStart = new Date(
    Date.now() - DEDUPE_WINDOW_HOURS * 3_600_000,
  ).toISOString()

  const { data: previous, error: previousError } = await supabase
    .from('risk_signals')
    .select('id, signal_value, signal_date')
    .eq('institution_id', inst.id)
    .eq('category', 'social_panic')
    .gte('signal_date', windowStart)
    .order('signal_date', { ascending: false })
    .limit(1)
  if (previousError) {
    console.error(
      `[social] dedupe lookup failed for ${inst.name}: ${previousError.message}`,
    )
    return 'error'
  }

  const last = previous?.[0]
  if (last) {
    const lastPct = Number(last.signal_value ?? 0)
    if (reading.pct < lastPct + DEDUPE_WORSE_BY_PCT) return 'deduped'
  }

  const severity: 'medium' | 'high' =
    reading.pct >= BEARISH_PCT_HIGH ? 'high' : 'medium'
  const window = reading.since ? ` since ${reading.since.slice(0, 10)}` : ''

  const { error: insertError } = await supabase.from('risk_signals').insert({
    institution_id: inst.id,
    category: 'social_panic',
    severity,
    title: `StockTwits ${reading.pct}% bearish on ${inst.name}`,
    description: `$${ticker} on StockTwits: ${reading.bearish} of ${reading.tagged} sentiment-tagged messages bearish (${reading.pct}%) across ${reading.sampled} messages${window}. Fires at ${MIN_TAGGED}+ tagged and >${BEARISH_PCT_THRESHOLD}% bearish.`,
    signal_value: reading.pct,
    signal_date: new Date().toISOString(),
    source: 'StockTwits',
  })
  if (insertError) {
    console.error(
      `[social] signal insert failed for ${inst.name}: ${insertError.message}`,
    )
    return 'error'
  }

  return 'inserted'
}
