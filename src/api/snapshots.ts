import { fetchAll } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { BenchmarkSnapshot, LatestPrice, Snapshot } from '@shared/types'

/** The columns the analysis pages need; score_components and volume are left out to keep ~12k rows small. */
export type SnapshotPoint = Pick<
  Snapshot,
  | 'institution_id'
  | 'snapshot_date'
  | 'risk_score'
  | 'stock_price'
  | 'stock_change_pct'
>

/** A snapshot that is guaranteed to carry a closing price. */
export type PricedSnapshotPoint = SnapshotPoint & { stock_price: number }

export type BenchmarkPoint = Pick<
  BenchmarkSnapshot,
  'ticker' | 'snapshot_date' | 'price' | 'change_pct'
>

export const DEFAULT_BENCHMARK_TICKERS: readonly string[] = ['XLF', 'SPY']

const SNAPSHOT_COLUMNS =
  'institution_id, snapshot_date, risk_score, stock_price, stock_change_pct'

function hasPrice(row: SnapshotPoint): row is PricedSnapshotPoint {
  return row.stock_price !== null
}

/**
 * Every snapshot with a closing price (event study / lead-lag input), ordered by
 * date then institution. Paged with fetchAll: the live table holds ~11k priced
 * rows and PostgREST truncates at 1000.
 */
export async function listPricedSnapshots(
  opts: { since?: string; institutionIds?: readonly string[] } = {},
): Promise<PricedSnapshotPoint[]> {
  if (opts.institutionIds && opts.institutionIds.length === 0) return []
  const rows = await fetchAll(() => {
    let query = supabase
      .from('daily_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .not('stock_price', 'is', null)
    if (opts.since) query = query.gte('snapshot_date', opts.since)
    if (opts.institutionIds)
      query = query.in('institution_id', [...opts.institutionIds])
    return query.order('snapshot_date').order('institution_id')
  })
  return rows.filter(hasPrice)
}

/**
 * All snapshots since a date (priced or not), ordered by date then institution.
 * Used for sparklines and day-over-day score deltas. 30 days is ~1.8k rows (2 pages).
 */
export async function listRecentSnapshots(opts: {
  since: string
}): Promise<SnapshotPoint[]> {
  return fetchAll(() =>
    supabase
      .from('daily_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .gte('snapshot_date', opts.since)
      .order('snapshot_date')
      .order('institution_id'),
  )
}

/** Benchmark closes (XLF, SPY) since a date, ordered by date then ticker. */
export async function listBenchmarks(
  opts: { since?: string; tickers?: readonly string[] } = {},
): Promise<BenchmarkPoint[]> {
  const tickers = opts.tickers ?? DEFAULT_BENCHMARK_TICKERS
  if (tickers.length === 0) return []
  return fetchAll(() => {
    let query = supabase
      .from('benchmark_snapshots')
      .select('ticker, snapshot_date, price, change_pct')
      .in('ticker', [...tickers])
    if (opts.since) query = query.gte('snapshot_date', opts.since)
    return query.order('snapshot_date').order('ticker')
  })
}

/**
 * Newest priced snapshot per institution. Fetches the newest `ids.length * 5`
 * priced rows (a week of trading days per bank) and keeps the first per id, so a
 * bank with no price in the last five snapshots is simply absent from the map.
 */
export async function getLatestPrices(
  ids: readonly string[],
): Promise<Map<string, LatestPrice>> {
  const latest = new Map<string, LatestPrice>()
  if (ids.length === 0) return latest
  const rows = unwrap(
    await supabase
      .from('daily_snapshots')
      .select('institution_id, snapshot_date, stock_price, stock_change_pct')
      .in('institution_id', [...ids])
      .not('stock_price', 'is', null)
      .order('snapshot_date', { ascending: false })
      .order('institution_id')
      .limit(ids.length * 5),
  )
  for (const row of rows) {
    if (row.stock_price === null || latest.has(row.institution_id)) continue
    latest.set(row.institution_id, {
      price: row.stock_price,
      change_pct: row.stock_change_pct,
      date: row.snapshot_date,
    })
  }
  return latest
}
