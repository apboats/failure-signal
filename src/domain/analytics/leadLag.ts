/**
 * Lead-lag: per bank, does a high score today precede a price drop `lagDays`
 * trading days later? Replaces the Correlation page's fixed ">= 8" test and
 * its icon driven by an unrelated statistic (finding F024). "High" is
 * max(WATCH, the bank's own 80th percentile), so a bank whose scores never
 * leave zero reports no high days instead of a hollow 0%. A price change of
 * exactly zero is neither a drop nor a rise and leaves the hit-rate
 * denominator.
 */
import { WATCH } from '@shared/thresholds'
import { pctReturn } from './eventStudy'
import type { BankSeries, SeriesPoint } from './series'
import {
  mean,
  percentile,
  spearmanRho,
  wilsonInterval,
  type Interval,
} from './stats'

export const DEFAULT_MIN_OBSERVATIONS = 20
/** Below this many high-score days the drop rate is reported but greyed. */
export const MIN_HIGH_DAYS = 10
export const HIGH_SCORE_PERCENTILE = 0.8

export interface LeadLagRow {
  institutionId: string
  /** Trading days in the bank's series. */
  days: number
  /** Days that have a price `lagDays` trading days later (the observations). */
  pairs: number
  /** max(WATCH, 80th percentile of the bank's own scores). */
  threshold: number
  /** High-score days with a non-zero forward price change (n). */
  highDays: number
  /** Of those, days the price fell (k). */
  dropsAfterHigh: number
  /** Percent, k / n. */
  dropRate: number | null
  /** Percent bounds (Wilson 95%). */
  dropCI: Interval | null
  /** Spearman rho of score_t against return_{t+lag}. */
  rho: number | null
  rhoN: number
  avgScoreBeforeDrop: number | null
  avgScoreBeforeRise: number | null
  dropDays: number
  riseDays: number
}

/** The bank's high-score line: never below WATCH, raised to its own 80th percentile when that is higher. */
export function highScoreThreshold(scores: readonly number[]): number {
  const p80 = percentile(scores, HIGH_SCORE_PERCENTILE)
  return Math.max(WATCH, p80 ?? 0)
}

export function computeLeadLag(
  series: BankSeries,
  lagDays: number,
  minObs = DEFAULT_MIN_OBSERVATIONS,
): LeadLagRow[] {
  const rows: LeadLagRow[] = []
  if (!(lagDays >= 1)) return rows
  for (const [institutionId, points] of series) {
    const pairs = Math.max(0, points.length - lagDays)
    if (pairs < Math.max(1, minObs)) continue
    const threshold = highScoreThreshold(points.map((point) => point.score))
    const scores: number[] = []
    const returns: number[] = []
    const beforeDrop: number[] = []
    const beforeRise: number[] = []
    let highDays = 0
    let dropsAfterHigh = 0
    for (let i = 0; i < pairs; i++) {
      const current = points[i]
      const future = points[i + lagDays]
      const change = pctReturn(current.price, future.price)
      if (change === null) continue
      scores.push(current.score)
      returns.push(change)
      if (change < 0) beforeDrop.push(current.score)
      else if (change > 0) beforeRise.push(current.score)
      if (current.score >= threshold && change !== 0) {
        highDays++
        if (change < 0) dropsAfterHigh++
      }
    }
    const ci = wilsonInterval(dropsAfterHigh, highDays)
    const correlation = spearmanRho(scores, returns)
    rows.push({
      institutionId,
      days: points.length,
      pairs,
      threshold,
      highDays,
      dropsAfterHigh,
      dropRate: highDays > 0 ? (dropsAfterHigh / highDays) * 100 : null,
      dropCI: ci ? { lower: ci.lower * 100, upper: ci.upper * 100 } : null,
      rho: correlation?.rho ?? null,
      rhoN: correlation?.n ?? scores.length,
      avgScoreBeforeDrop: mean(beforeDrop),
      avgScoreBeforeRise: mean(beforeRise),
      dropDays: beforeDrop.length,
      riseDays: beforeRise.length,
    })
  }
  return rows
}

/** One point of the dual-axis chart: score and price indexed to 100 on the first day (a number, not a string). */
export interface ChartPoint {
  date: string
  score: number
  price: number
}

export function buildChartSeries(points: readonly SeriesPoint[]): ChartPoint[] {
  const first = points.find((point) => point.price > 0)?.price
  if (first === undefined) return []
  return points.map((point) => ({
    date: point.date,
    score: point.score,
    price: Math.round((point.price / first) * 1000) / 10,
  }))
}
