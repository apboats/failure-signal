/**
 * daily-snapshot: runs at 22:00 UTC (after the US close) and writes, per active
 * bank, one daily_snapshots row (latest risk score + today's close) and any
 * trading signals the day's move implies; also XLF/SPY benchmark_snapshots.
 *
 * Trading-day rule: a price is written only when the quote's session, taken
 * in America/New_York, is today's New York date. Weekends and market holidays
 * get a snapshot with a null price, never a copy of Friday's close, so the
 * priced series the analysis pages index is a series of trading days.
 *
 * Signal rules live in ../_shared/signals.ts (pure, vitest-covered). This file
 * supplies the inputs: today's score, the latest snapshot strictly before today
 * (null when there is none, so a first observation never "crosses"), and the
 * bank's open short_entry with the number of risk signals added since it.
 *
 * Reads are bounded (PostgREST max_rows is 1000): one query each for latest
 * scores, previous snapshots and active trading signals, plus one for risk
 * signals since the open entries, instead of three queries per bank.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { optionalEnv, requireEnv } from '../_shared/env.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'
import {
  generateTradingSignals,
  type OpenEntry,
  type TradingSignalType,
} from '../_shared/signals.ts'

const MARKET_TZ = 'America/New_York'
const BENCHMARK_TICKERS = ['XLF', 'SPY'] as const

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** PostgREST max_rows on the live project; every read states it explicitly. */
const ROW_CAP = 1000
/**
 * Latest scores come from one bounded read over this window (61 banks x 24
 * hourly rows is 1,464, so the newest 1,000 still hold every bank scored in
 * the last ~16 h); a bank missing from it falls back to a one-row lookup.
 */
const LATEST_SCORE_WINDOW_MS = 24 * HOUR_MS
/** Previous-snapshot lookback: 61 banks x 7 days stays well under ROW_CAP. */
const PREV_SNAPSHOT_WINDOW_DAYS = 7

/** Finnhub free tier: 60 calls/min. Pace lightly and pause before the limit. */
const FINNHUB_PACE_MS = 100
const FINNHUB_CALLS_PER_MINUTE = 55
const FINNHUB_PAUSE_MS = 61_000

interface Quote {
  price: number
  /** Percent change versus the previous session, null when unknown. */
  changePct: number | null
}

interface InstitutionRow {
  id: string
  name: string
  ticker: string | null
}

interface LatestScoreRow {
  institution_id: string
  score: number | string
  score_components: Record<string, unknown> | null
  signal_count: number | null
  computed_at: string
}

interface PrevSnapshotRow {
  institution_id: string
  snapshot_date: string
  risk_score: number | string
  signal_count: number | null
}

interface ActiveSignalRow {
  id: string
  institution_id: string
  signal_type: TradingSignalType
  score_at_signal: number | string | null
  created_at: string
}

const marketDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar date ('YYYY-MM-DD') of an instant in America/New_York. */
export function marketDate(at: Date): string {
  const parts = marketDateFormat.formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** `isoDate` minus `days`, as 'YYYY-MM-DD'. */
function daysBefore(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/** First row per institution from a newest-first result. */
function firstPerInstitution<T extends { institution_id: string }>(
  rows: T[],
): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    if (!out.has(row.institution_id)) out.set(row.institution_id, row)
  }
  return out
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )
    const finnhubKey = optionalEnv(
      'FINNHUB_KEY',
      "today's daily_snapshots are written with null prices",
    )

    const now = new Date()
    const today = marketDate(now)

    // 1. Benchmarks: skipped (not copied) when the last bar is not today's session.
    const benchmarks: Record<string, Quote | null> = {}
    for (const ticker of BENCHMARK_TICKERS) {
      try {
        const quote = await fetchYahooQuote(ticker, today)
        benchmarks[ticker] = quote
        if (!quote) continue
        const { error } = await supabase.from('benchmark_snapshots').upsert(
          {
            ticker,
            snapshot_date: today,
            price: quote.price,
            change_pct: quote.changePct,
          },
          { onConflict: 'ticker,snapshot_date' },
        )
        if (error) {
          console.error(
            `benchmark_snapshots upsert failed for ${ticker}: ${error.message}`,
          )
        }
      } catch (error) {
        console.error(`Benchmark fetch failed for ${ticker}:`, error)
        benchmarks[ticker] = null
      }
    }

    // 2. Active banks.
    const { data: institutionRows, error: instError } = await supabase
      .from('institutions')
      .select('id, name, ticker')
      .eq('is_active', true)
      .order('id')
      .limit(ROW_CAP)
    if (instError) throw instError
    const institutions = (institutionRows ?? []) as InstitutionRow[]

    // 3. Latest score per bank: one bounded read, newest first.
    const { data: scoreRows, error: scoreError } = await supabase
      .from('risk_scores')
      .select(
        'institution_id, score, score_components, signal_count, computed_at',
      )
      .gte(
        'computed_at',
        new Date(now.getTime() - LATEST_SCORE_WINDOW_MS).toISOString(),
      )
      .order('computed_at', { ascending: false })
      .limit(ROW_CAP)
    if (scoreError) throw scoreError
    const latestScores = firstPerInstitution(
      (scoreRows ?? []) as LatestScoreRow[],
    )

    // 4. Latest snapshot strictly before today, per bank.
    const { data: snapshotRows, error: snapshotError } = await supabase
      .from('daily_snapshots')
      .select('institution_id, snapshot_date, risk_score, signal_count')
      .lt('snapshot_date', today)
      .gte('snapshot_date', daysBefore(today, PREV_SNAPSHOT_WINDOW_DAYS))
      .order('snapshot_date', { ascending: false })
      .limit(ROW_CAP)
    if (snapshotError) throw snapshotError
    const prevSnapshots = firstPerInstitution(
      (snapshotRows ?? []) as PrevSnapshotRow[],
    )

    // 5. Active trading signals: the open short_entry per bank, and which
    //    (bank, type) pairs were already emitted today (idempotent reruns).
    const { data: activeRows, error: activeError } = await supabase
      .from('trading_signals')
      .select('id, institution_id, signal_type, score_at_signal, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)
    if (activeError) throw activeError
    const openEntries = new Map<string, ActiveSignalRow>()
    const emittedToday = new Set<string>()
    for (const row of (activeRows ?? []) as ActiveSignalRow[]) {
      if (marketDate(new Date(row.created_at)) === today) {
        emittedToday.add(`${row.institution_id}:${row.signal_type}`)
      }
      if (
        row.signal_type === 'short_entry' &&
        !openEntries.has(row.institution_id)
      ) {
        openEntries.set(row.institution_id, row)
      }
    }

    // 6. Risk signals added since each open entry (evidence vs. decay).
    const newSinceEntry = await countSignalsSinceEntries(supabase, openEntries)

    // 7. Per-bank snapshot and signals.
    const quoteFor = finnhubKey ? makeQuoteFetcher(finnhubKey, today) : null
    const results: Array<{
      institution: string
      score: number | null
      score_change: number | null
      stock_price: number | null
      signals: TradingSignalType[]
    }> = []

    for (const inst of institutions) {
      const latest =
        latestScores.get(inst.id) ?? (await fetchLatestScore(supabase, inst.id))
      if (!latest) {
        console.warn(
          `No risk score on record for ${inst.name}; no snapshot written`,
        )
        results.push({
          institution: inst.name,
          score: null,
          score_change: null,
          stock_price: null,
          signals: [],
        })
        continue
      }

      const currentScore = Number(latest.score)
      const signalCount = latest.signal_count ?? 0
      const prev = prevSnapshots.get(inst.id) ?? null
      const prevScore = prev ? Number(prev.risk_score) : null
      const prevSignalCount = prev ? (prev.signal_count ?? 0) : null
      const scoreChange = prevScore === null ? null : currentScore - prevScore

      const quote =
        quoteFor && inst.ticker && !inst.ticker.includes('.')
          ? await quoteFor(inst.ticker)
          : null

      const { error: upsertError } = await supabase
        .from('daily_snapshots')
        .upsert(
          {
            institution_id: inst.id,
            snapshot_date: today,
            risk_score: currentScore,
            score_components: latest.score_components ?? {},
            signal_count: signalCount,
            stock_price: quote?.price ?? null,
            stock_change_pct: quote?.changePct ?? null,
            // Finnhub /quote carries no volume; null says so, 0 would not.
            volume: null,
          },
          { onConflict: 'institution_id,snapshot_date' },
        )
      if (upsertError) {
        console.error(
          `daily_snapshots upsert failed for ${inst.name}: ${upsertError.message}`,
        )
      }

      const entry = openEntries.get(inst.id) ?? null
      const openEntry: OpenEntry | null = entry
        ? {
            score_at_signal: Number(entry.score_at_signal ?? 0),
            // signal_count is a 30-day window, so "count at entry" cannot be
            // read back from it. Deriving it from the exact number of risk
            // signals inserted since the entry keeps the comparison exact:
            // signalCount > signal_count_at_entry iff new signals arrived.
            signal_count_at_entry: Math.max(
              0,
              signalCount - (newSinceEntry.get(inst.id) ?? 0),
            ),
            days_open: Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(entry.created_at).getTime()) / DAY_MS,
              ),
            ),
          }
        : null

      const signals = generateTradingSignals({
        currentScore,
        prevScore,
        signalCount,
        prevSignalCount,
        openEntry,
      })

      const emitted: TradingSignalType[] = []
      for (const [type, reason] of signals) {
        if (emittedToday.has(`${inst.id}:${type}`)) {
          console.log(`${inst.name}: ${type} already emitted today; skipped`)
          continue
        }

        if (type === 'short_exit' && entry) {
          const { error } = await supabase
            .from('trading_signals')
            .update({ is_active: false })
            .eq('id', entry.id)
          if (error) {
            console.error(
              `Could not close short_entry ${entry.id} for ${inst.name}: ${error.message}`,
            )
          }
        }

        // One active row per type per bank.
        const { error: closeError } = await supabase
          .from('trading_signals')
          .update({ is_active: false })
          .eq('institution_id', inst.id)
          .eq('signal_type', type)
          .eq('is_active', true)
        if (closeError) {
          console.error(
            `Could not deactivate ${type} rows for ${inst.name}: ${closeError.message}`,
          )
        }

        const { error: insertError } = await supabase
          .from('trading_signals')
          .insert({
            institution_id: inst.id,
            signal_type: type,
            score_at_signal: currentScore,
            score_change: scoreChange,
            price_at_signal: quote?.price ?? null,
            reason,
            is_active: true,
          })
        if (insertError) {
          console.error(
            `trading_signals insert failed (${type}, ${inst.name}): ${insertError.message}`,
          )
          continue
        }
        emitted.push(type)
        emittedToday.add(`${inst.id}:${type}`)
      }

      results.push({
        institution: inst.name,
        score: currentScore,
        score_change: scoreChange,
        stock_price: quote?.price ?? null,
        signals: emitted,
      })
    }

    return json({ success: true, date: today, benchmarks, results })
  } catch (error) {
    console.error('daily-snapshot failed:', error)
    return json({ error: String(error) }, 500)
  }
})

type Supabase = ReturnType<typeof createClient>

/** One-row fallback for a bank not scored inside LATEST_SCORE_WINDOW_MS. */
async function fetchLatestScore(
  supabase: Supabase,
  institutionId: string,
): Promise<LatestScoreRow | null> {
  const { data, error } = await supabase
    .from('risk_scores')
    .select(
      'institution_id, score, score_components, signal_count, computed_at',
    )
    .eq('institution_id', institutionId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(
      `Latest score lookup failed for ${institutionId}: ${error.message}`,
    )
    return null
  }
  return (data as LatestScoreRow | null) ?? null
}

/**
 * How many risk_signals were inserted after each open entry, by institution.
 * One bounded read from the earliest open entry onward.
 */
async function countSignalsSinceEntries(
  supabase: Supabase,
  openEntries: Map<string, ActiveSignalRow>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (openEntries.size === 0) return counts

  // Compare as epoch ms: PostgREST writes '+00:00' and toISOString() 'Z',
  // so the two string forms do not order reliably against each other.
  const entries = [...openEntries.values()]
  const entryAt = new Map<string, number>()
  for (const e of entries)
    entryAt.set(e.institution_id, Date.parse(e.created_at))
  const earliest = new Date(Math.min(...entryAt.values())).toISOString()

  const { data, error } = await supabase
    .from('risk_signals')
    .select('institution_id, created_at')
    .in(
      'institution_id',
      entries.map((e) => e.institution_id),
    )
    .gte('created_at', earliest)
    .order('created_at', { ascending: false })
    .limit(ROW_CAP)
  if (error) {
    console.error(`risk_signals since-entry lookup failed: ${error.message}`)
    return counts
  }
  const rows = (data ?? []) as Array<{
    institution_id: string
    created_at: string
  }>
  if (rows.length >= ROW_CAP) {
    console.warn(
      `risk_signals since-entry lookup hit the ${ROW_CAP}-row cap; counts may be low`,
    )
  }
  for (const row of rows) {
    const openedAt = entryAt.get(row.institution_id)
    if (openedAt === undefined || Date.parse(row.created_at) <= openedAt) {
      continue
    }
    counts.set(row.institution_id, (counts.get(row.institution_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Finnhub quotes for the run: one call per distinct ticker, light pacing,
 * and a pause before the free tier's per-minute limit.
 */
function makeQuoteFetcher(
  key: string,
  today: string,
): (ticker: string) => Promise<Quote | null> {
  const cache = new Map<string, Quote | null>()
  let calls = 0
  return async (ticker) => {
    const cached = cache.get(ticker)
    if (cached !== undefined) return cached
    if (calls > 0 && calls % FINNHUB_CALLS_PER_MINUTE === 0) {
      console.log(
        `Finnhub: ${calls} calls made; pausing ${FINNHUB_PAUSE_MS} ms for the per-minute limit`,
      )
      await sleep(FINNHUB_PAUSE_MS)
    } else if (calls > 0) {
      await sleep(FINNHUB_PACE_MS)
    }
    calls++
    const quote = await fetchStockPrice(ticker, today, key)
    cache.set(ticker, quote)
    return quote
  }
}

/**
 * Finnhub /quote. Returns null unless the quote's session (`t`, unix seconds)
 * falls on `today` in America/New_York: on a weekend or holiday the endpoint
 * repeats the last close, which must not become today's price.
 */
async function fetchStockPrice(
  ticker: string,
  today: string,
  key: string,
): Promise<Quote | null> {
  const label = `Finnhub quote ${ticker}`
  try {
    const response = await fetchWithRetry(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`,
      undefined,
      { label },
    )
    // Non-OK status and body prefix are already logged under `label`.
    if (!response.ok) return null

    const data = (await response.json()) as {
      c?: number | null
      dp?: number | null
      t?: number | null
    }
    if (typeof data.c !== 'number' || data.c === 0) {
      console.warn(`${label}: no price in response`)
      return null
    }
    if (typeof data.t !== 'number' || data.t <= 0) {
      console.warn(`${label}: no session timestamp; treated as stale`)
      return null
    }
    const session = marketDate(new Date(data.t * 1000))
    if (session !== today) {
      console.log(
        `${label}: last session ${session} is not ${today}; price left null`,
      )
      return null
    }
    return {
      price: data.c,
      changePct: typeof data.dp === 'number' ? data.dp : null,
    }
  } catch (error) {
    console.error(`${label} failed:`, error)
    return null
  }
}

/**
 * Yahoo chart for a benchmark ETF. Returns null unless the last daily bar is
 * today's New York session. The change is against the previous bar's close
 * (range=5d guarantees one exists after a long weekend); `chartPreviousClose`
 * is the close before the range, so it is only a last resort.
 */
async function fetchYahooQuote(
  ticker: string,
  today: string,
): Promise<Quote | null> {
  const label = `Yahoo chart ${ticker}`
  try {
    const response = await fetchWithRetry(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      { label },
    )
    if (!response.ok) return null

    const data = await response.json()
    const result = data?.chart?.result?.[0]
    if (!result) {
      console.warn(`${label}: empty result`)
      return null
    }

    const timestamps: unknown[] = Array.isArray(result.timestamp)
      ? result.timestamp
      : []
    const lastBar = timestamps.at(-1)
    if (typeof lastBar !== 'number') {
      console.warn(`${label}: no bars in response`)
      return null
    }
    const session = marketDate(new Date(lastBar * 1000))
    if (session !== today) {
      console.log(
        `${label}: last bar ${session} is not ${today}; benchmark skipped`,
      )
      return null
    }

    const meta = result.meta ?? {}
    const closes: unknown[] = Array.isArray(
      result.indicators?.quote?.[0]?.close,
    )
      ? result.indicators.quote[0].close
      : []
    const lastClose = closes.at(-1)
    const prevBarClose = closes.at(-2)

    const price =
      typeof meta.regularMarketPrice === 'number'
        ? meta.regularMarketPrice
        : lastClose
    if (typeof price !== 'number' || price <= 0) {
      console.warn(`${label}: no price in response`)
      return null
    }

    const prevClose = [
      prevBarClose,
      meta.previousClose,
      meta.chartPreviousClose,
    ].find((v): v is number => typeof v === 'number' && v > 0)
    const changePct =
      prevClose === undefined ? null : ((price - prevClose) / prevClose) * 100
    return { price, changePct }
  } catch (error) {
    console.error(`${label} failed:`, error)
    return null
  }
}
