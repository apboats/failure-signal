/**
 * Shared 12-trading-day fixture for the analytics tests (June 1–16, 2026).
 *
 * Calendar: Jun 1 (Mon) – Jun 5 (Fri), Jun 6–7 weekend, Jun 8–12, Jun 13–14
 * weekend, Jun 15 (Mon), Jun 16 (Tue). Every 12-day bank also carries the four
 * weekend rows that copy Friday's close, as the live table does.
 *
 * Banks (trading-day index 0..11):
 * - bank-a: scores 0,1,2,9,9.5,10,9,8.5,8,7,6,5. Level 8 crosses once at index 3
 *   (Jun 4) and stays above through index 8. Velocity (delta 5) holds on
 *   several consecutive days but must fire once.
 * - bank-b: starts at 9 with no prior row (first-row no-event), then 2s. Its
 *   Jun 15 row copies Jun 12's price and change (a holiday copy to drop).
 * - bank-d: crosses at index 1 (Jun 2), prices fall throughout.
 * - bank-e, bank-f: cross at index 5 (Jun 8), the same date.
 * - bank-g: two rows nine calendar days apart (0 then 9): too wide a gap.
 *
 * Benchmark XLF: closes Jun 1–5 (+ weekend copies) and Jun 8, then nothing until
 * Jun 16. As-of lookups work through Jun 12 (gap 4 from Jun 8) and fail on
 * Jun 15 (gap 7).
 */
import type { PricedSnapshotPoint } from '@/api/snapshots'
import type { BenchmarkRow } from './benchmark'

export const TRADING_DAYS: readonly string[] = [
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-08',
  '2026-06-09',
  '2026-06-10',
  '2026-06-11',
  '2026-06-12',
  '2026-06-15',
  '2026-06-16',
]

export const WEEKEND_DAYS: readonly string[] = [
  '2026-06-06',
  '2026-06-07',
  '2026-06-13',
  '2026-06-14',
]

interface BankSpec {
  id: string
  scores: readonly number[]
  prices: readonly number[]
}

const BANKS: readonly BankSpec[] = [
  {
    id: 'bank-a',
    scores: [0, 1, 2, 9, 9.5, 10, 9, 8.5, 8, 7, 6, 5],
    prices: [100, 101, 102, 100, 98, 97, 96, 95, 94, 95, 96, 97],
  },
  {
    id: 'bank-b',
    scores: [9, 9, 9, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    prices: [50, 50.5, 51, 51.5, 52, 52.5, 53, 53.5, 54, 54.5, 55, 55.5],
  },
  {
    id: 'bank-d',
    scores: [0, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
    prices: [20, 20.2, 19.8, 19.6, 19, 18.8, 18.5, 18.2, 18, 17.8, 17.5, 17.2],
  },
  {
    id: 'bank-e',
    scores: [0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9],
    prices: [30, 30.3, 30.6, 30.9, 31.2, 31.5, 31, 30.5, 30, 29.5, 29, 28.5],
  },
  {
    id: 'bank-f',
    scores: [0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9],
    prices: [80, 80.8, 81.6, 82.4, 83.2, 84, 83, 82, 81, 80, 79, 78],
  },
]

function changePct(prices: readonly number[], i: number): number | null {
  if (i === 0) return null
  const previous = prices[i - 1]
  return Math.round(((prices[i] - previous) / previous) * 10000) / 100
}

function row(
  institution_id: string,
  snapshot_date: string,
  risk_score: number,
  stock_price: number,
  stock_change_pct: number | null,
): PricedSnapshotPoint {
  return {
    institution_id,
    snapshot_date,
    risk_score,
    stock_price,
    stock_change_pct,
  }
}

function bankRows(spec: BankSpec): PricedSnapshotPoint[] {
  const rows: PricedSnapshotPoint[] = []
  TRADING_DAYS.forEach((date, i) => {
    rows.push(
      row(
        spec.id,
        date,
        spec.scores[i],
        spec.prices[i],
        changePct(spec.prices, i),
      ),
    )
  })
  // Weekend rows copy Friday's close and change (indexes 4 and 9 are the Fridays).
  for (const date of WEEKEND_DAYS) {
    const friday = date < '2026-06-08' ? 4 : 9
    rows.push(
      row(
        spec.id,
        date,
        spec.scores[friday],
        spec.prices[friday],
        changePct(spec.prices, friday),
      ),
    )
  }
  return rows
}

/** Every bank's rows, shuffled out of date order so grouping has to sort. */
export function fixtureRows(): PricedSnapshotPoint[] {
  const rows: PricedSnapshotPoint[] = []
  for (const spec of BANKS) rows.push(...bankRows(spec))
  // bank-b's Jun 15 is a holiday copy of Jun 12: same price and change as the previous row.
  const b15 = rows.find(
    (r) => r.institution_id === 'bank-b' && r.snapshot_date === '2026-06-15',
  )
  const b12 = rows.find(
    (r) => r.institution_id === 'bank-b' && r.snapshot_date === '2026-06-12',
  )
  if (b15 && b12) {
    b15.stock_price = b12.stock_price
    b15.stock_change_pct = b12.stock_change_pct
  }
  rows.push(row('bank-g', '2026-06-01', 0, 10, null))
  rows.push(row('bank-g', '2026-06-10', 9, 9, -10))
  return rows.reverse()
}

export const XLF_PRICES: Readonly<Record<string, number>> = {
  '2026-06-01': 40,
  '2026-06-02': 40.4,
  '2026-06-03': 40.2,
  '2026-06-04': 40,
  '2026-06-05': 39.8,
  '2026-06-06': 39.8,
  '2026-06-07': 39.8,
  '2026-06-08': 39.6,
  '2026-06-16': 39,
}

export function fixtureBenchmarks(): BenchmarkRow[] {
  return Object.entries(XLF_PRICES).map(([snapshot_date, price]) => ({
    ticker: 'XLF',
    snapshot_date,
    price,
  }))
}

/** id -> is_active for computeDataWindow; bank-g is inactive. */
export function fixtureIndex(): Map<string, { is_active: boolean }> {
  return new Map([
    ['bank-a', { is_active: true }],
    ['bank-b', { is_active: true }],
    ['bank-d', { is_active: true }],
    ['bank-e', { is_active: true }],
    ['bank-f', { is_active: true }],
    ['bank-g', { is_active: false }],
  ])
}
