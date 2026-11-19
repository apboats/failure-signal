/**
 * Benchmark (XLF / SPY) closes with an as-of lookup. The old pages joined on
 * the exact date string, so a missing benchmark day silently removed every
 * event on that date (finding F049). Here each ticker keeps a sorted array and
 * a lookup returns the last close on or before the target date, or null when
 * there is none or the gap exceeds MAX_BENCHMARK_GAP_DAYS calendar days (a long
 * outage must not join stale prices).
 */
import { dayNumber } from './series'

/** The columns the index needs; src/api/snapshots BenchmarkPoint satisfies it. */
export interface BenchmarkRow {
  ticker: string
  snapshot_date: string
  price: number
}

/** Close on or before an ISO date for one ticker, or null. */
export type BenchmarkLookup = (date: string) => number | null

export interface BenchmarkIndex {
  /** Tickers with at least one usable close, sorted. */
  tickers: readonly string[]
  asOf(ticker: string, date: string): number | null
  /** A stable lookup function per ticker (same function identity on repeat calls). */
  lookup(ticker: string): BenchmarkLookup
  /** Number of distinct dates held for a ticker. */
  size(ticker: string): number
}

export const MAX_BENCHMARK_GAP_DAYS = 4

/** Index of the last element <= target in an ascending array, or -1 (binary search). */
export function lastIndexAtOrBefore(
  values: readonly number[],
  target: number,
): number {
  let lo = 0
  let hi = values.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (values[mid] <= target) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

interface TickerSeries {
  days: number[]
  prices: number[]
}

export function buildBenchmarkIndex(
  rows: readonly BenchmarkRow[],
  maxGapDays = MAX_BENCHMARK_GAP_DAYS,
): BenchmarkIndex {
  const staging = new Map<string, Map<number, number>>()
  for (const row of rows) {
    const day = dayNumber(row.snapshot_date)
    if (Number.isNaN(day) || !Number.isFinite(row.price) || row.price <= 0)
      continue
    let byDay = staging.get(row.ticker)
    if (!byDay) {
      byDay = new Map()
      staging.set(row.ticker, byDay)
    }
    // Same date twice: the later row wins, matching an upsert.
    byDay.set(day, row.price)
  }

  const byTicker = new Map<string, TickerSeries>()
  for (const [ticker, byDay] of staging) {
    const entries = [...byDay.entries()].sort((a, b) => a[0] - b[0])
    byTicker.set(ticker, {
      days: entries.map((entry) => entry[0]),
      prices: entries.map((entry) => entry[1]),
    })
  }

  const asOf = (ticker: string, date: string): number | null => {
    const entry = byTicker.get(ticker)
    if (!entry) return null
    const target = dayNumber(date)
    if (Number.isNaN(target)) return null
    const i = lastIndexAtOrBefore(entry.days, target)
    if (i < 0) return null
    if (target - entry.days[i] > maxGapDays) return null
    return entry.prices[i]
  }

  const lookups = new Map<string, BenchmarkLookup>()
  const lookup = (ticker: string): BenchmarkLookup => {
    let fn = lookups.get(ticker)
    if (!fn) {
      fn = (date) => asOf(ticker, date)
      lookups.set(ticker, fn)
    }
    return fn
  }

  return {
    tickers: [...byTicker.keys()].sort(),
    asOf,
    lookup,
    size: (ticker) => byTicker.get(ticker)?.days.length ?? 0,
  }
}

/** Percent return of the benchmark between two dates via as-of lookups; null when either side is missing. */
export function benchmarkReturn(
  lookup: BenchmarkLookup,
  fromDate: string,
  toDate: string,
): number | null {
  const from = lookup(fromDate)
  const to = lookup(toDate)
  if (from === null || to === null || from <= 0) return null
  return ((to - from) / from) * 100
}
