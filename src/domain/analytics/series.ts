/**
 * Turns priced daily_snapshots rows into per-bank trading-day series.
 *
 * The daily-snapshot job ran seven days a week and copied Friday's close onto
 * Saturday, Sunday and market holidays (review finding F003). Until
 * supabase/ops/01 nulls those prices, this module drops weekend rows and any
 * row whose price AND change equal the previous row's for the same bank, so a
 * horizon of "5" means five trading days, not five calendar rows.
 */
import type { PricedSnapshotPoint } from '@/api/snapshots'

/** One trading day of one bank. */
export interface SeriesPoint {
  /** 'YYYY-MM-DD'. */
  date: string
  score: number
  price: number
  changePct: number | null
}

/** institution_id -> ascending trading-day points. */
export type BankSeries = ReadonlyMap<string, readonly SeriesPoint[]>

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const DAY_MS = 86_400_000

/** Days since 1970-01-01 for a 'YYYY-MM-DD' string (UTC arithmetic, no time zone drift); NaN when malformed. */
export function dayNumber(iso: string): number {
  const match = ISO_DATE.exec(iso)
  if (!match) return Number.NaN
  return Math.floor(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS,
  )
}

/** Calendar days from `fromIso` to `toIso` (negative when reversed; NaN when malformed). */
export function calendarGap(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso)
}

/** Saturday or Sunday. 1970-01-01 was a Thursday, so weekday = (day + 4) mod 7 with Sunday = 0. */
export function isWeekend(iso: string): boolean {
  const day = dayNumber(iso)
  if (Number.isNaN(day)) return false
  const weekday = (((day + 4) % 7) + 7) % 7
  return weekday === 0 || weekday === 6
}

function byDate(a: PricedSnapshotPoint, b: PricedSnapshotPoint): number {
  return a.snapshot_date < b.snapshot_date
    ? -1
    : a.snapshot_date > b.snapshot_date
      ? 1
      : 0
}

/** Rows grouped by institution_id, each group sorted by snapshot_date ascending. */
export function groupByInstitution(
  rows: readonly PricedSnapshotPoint[],
): Map<string, PricedSnapshotPoint[]> {
  const groups = new Map<string, PricedSnapshotPoint[]>()
  for (const row of rows) {
    const list = groups.get(row.institution_id)
    if (list) list.push(row)
    else groups.set(row.institution_id, [row])
  }
  for (const list of groups.values()) list.sort(byDate)
  return groups
}

export interface TradingDaySeries {
  series: Map<string, SeriesPoint[]>
  /** Points kept across all banks. */
  tradingDays: number
  droppedWeekend: number
  /** Weekday rows that repeated the previous row's price and change (holiday copies). */
  droppedDuplicates: number
}

/**
 * Per-bank trading-day series: weekend rows go, and so does any row whose
 * stock_price and stock_change_pct both equal the previous row's for that bank
 * (the copied-close signature). Within each bank the points stay in date order.
 */
export function toTradingDaySeries(
  rows: readonly PricedSnapshotPoint[],
): TradingDaySeries {
  const series = new Map<string, SeriesPoint[]>()
  let tradingDays = 0
  let droppedWeekend = 0
  let droppedDuplicates = 0
  for (const [institutionId, list] of groupByInstitution(rows)) {
    const points: SeriesPoint[] = []
    let previous: PricedSnapshotPoint | null = null
    for (const row of list) {
      const duplicate =
        previous !== null &&
        row.stock_price === previous.stock_price &&
        row.stock_change_pct === previous.stock_change_pct
      previous = row
      if (isWeekend(row.snapshot_date)) {
        droppedWeekend++
        continue
      }
      if (duplicate) {
        droppedDuplicates++
        continue
      }
      points.push({
        date: row.snapshot_date,
        score: row.risk_score,
        price: row.stock_price,
        changePct: row.stock_change_pct,
      })
    }
    if (points.length > 0) {
      series.set(institutionId, points)
      tradingDays += points.length
    }
  }
  return { series, tradingDays, droppedWeekend, droppedDuplicates }
}

/** What the page's DataWindow line reports, computed from the fetched rows. */
export interface DataWindow {
  /** Rows belonging to active institutions, in the order they were fetched. */
  rows: PricedSnapshotPoint[]
  /** Earliest / latest snapshot_date among `rows`, null when there are none. */
  from: string | null
  to: string | null
  /** Distinct active institutions in `rows`. */
  banks: number
  /** Rows dropped because their institution is inactive or unknown. */
  excludedInactiveRows: number
  /** Distinct institutions those rows belonged to. */
  excludedInactiveBanks: number
}

/**
 * Restricts rows to institutions that are is_active in the index and reports
 * the window they span. Unknown ids count as inactive: a bank that was removed
 * from the index must not feed the statistics anonymously (finding F010).
 */
export function computeDataWindow(
  rows: readonly PricedSnapshotPoint[],
  index: ReadonlyMap<string, { is_active: boolean }>,
): DataWindow {
  const kept: PricedSnapshotPoint[] = []
  const banks = new Set<string>()
  const excludedBanks = new Set<string>()
  let excludedInactiveRows = 0
  let from: string | null = null
  let to: string | null = null
  for (const row of rows) {
    if (index.get(row.institution_id)?.is_active !== true) {
      excludedInactiveRows++
      excludedBanks.add(row.institution_id)
      continue
    }
    kept.push(row)
    banks.add(row.institution_id)
    if (from === null || row.snapshot_date < from) from = row.snapshot_date
    if (to === null || row.snapshot_date > to) to = row.snapshot_date
  }
  return {
    rows: kept,
    from,
    to,
    banks: banks.size,
    excludedInactiveRows,
    excludedInactiveBanks: excludedBanks.size,
  }
}
