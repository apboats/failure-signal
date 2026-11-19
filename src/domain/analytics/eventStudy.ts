/**
 * Event study: when the score meets an event definition, how did the bank's
 * stock do against the benchmark over the next N trading days?
 *
 * Every (bank, trading day) pair gets its raw and excess returns computed, so
 * the non-event days form a measured baseline for the same window instead of
 * an asserted "random would be ~50%" (finding F047). Level events fire on the
 * first crossing only and need a prior observation on the previous trading
 * day (F081); velocity events fire only on the first day the delta condition
 * holds (F022). Hit rates exclude exact-zero excess returns (F082). The
 * verdict needs n >= MIN_EVENTS_FOR_VERDICT and a Welch t <= PREDICTIVE_T
 * against the baseline; the hit-rate interval is corroboration only (F021).
 */
import type { BenchmarkLookup } from './benchmark'
import { calendarGap, type BankSeries, type SeriesPoint } from './series'
import {
  mean,
  median,
  se as standardError,
  tStat,
  welchT,
  wilsonInterval,
  type Interval,
} from './stats'

export type EventDef =
  | { kind: 'level'; threshold: number }
  | { kind: 'velocity'; delta: number; windowDays: number }

/** Horizons in trading days after the event. */
export const DEFAULT_HORIZONS: readonly number[] = [1, 5, 10, 20]
/** The horizon the verdict is judged on. */
export const VERDICT_HORIZON = 5
/** Events with a benchmark return needed before a verdict is attempted. */
export const MIN_EVENTS_FOR_VERDICT = 30
/** Below this many events a horizon row is reported as insufficient. */
export const MIN_EVENTS_PER_HORIZON = 10
/** A level crossing needs its prior observation within this many calendar days. */
export const MAX_PRIOR_GAP_DAYS = 4
/** Welch t at or below this (events vs baseline) counts as predictive. */
export const PREDICTIVE_T = -2
/** 95% two-sided normal quantile for the mean ± interval. */
export const Z_95 = 1.96

/** horizon -> value (null when the horizon runs past the series or lacks a benchmark). */
export type HorizonValues = Record<number, number | null>

export interface StudyEvent {
  institutionId: string
  date: string
  score: number
  priorScore: number
  /** Stock return in percent per horizon. */
  raw: HorizonValues
  /** Stock return minus benchmark return, in percent, per horizon. */
  excess: HorizonValues
}

export interface EventStudy {
  events: StudyEvent[]
  /** Excess returns of every non-event (bank, day) pair with a benchmark, per horizon. */
  baseline: Record<number, number[]>
  horizons: readonly number[]
  distinctDates: number
  distinctBanks: number
  /** (bank, trading day) pairs scanned. */
  observations: number
}

/**
 * Prior score when (points, i) is an event under `def`, else null.
 *
 * Level: the previous trading day (gap <= MAX_PRIOR_GAP_DAYS) was below the
 * threshold and today is at or above it. The first row can never fire.
 * Velocity: score rose by at least `delta` over `windowDays` rows, and the
 * same test did not already hold yesterday.
 */
export function eventAt(
  points: readonly SeriesPoint[],
  i: number,
  def: EventDef,
): number | null {
  const current = points[i]
  if (def.kind === 'level') {
    if (i === 0) return null
    const previous = points[i - 1]
    if (calendarGap(previous.date, current.date) > MAX_PRIOR_GAP_DAYS)
      return null
    if (previous.score >= def.threshold) return null
    if (current.score < def.threshold) return null
    return previous.score
  }
  const lookback = i - def.windowDays
  if (lookback < 0) return null
  const base = points[lookback]
  if (current.score - base.score < def.delta) return null
  if (lookback > 0) {
    const previousDelta = points[i - 1].score - points[lookback - 1].score
    if (previousDelta >= def.delta) return null
  }
  return base.score
}

/** Percent change from `from` to `to`; null when `from` is not a positive price. */
export function pctReturn(from: number, to: number): number | null {
  if (!(from > 0) || !Number.isFinite(to)) return null
  return ((to - from) / from) * 100
}

export function detectEvents(
  series: BankSeries,
  def: EventDef,
  benchmark: BenchmarkLookup,
  horizons: readonly number[] = DEFAULT_HORIZONS,
): EventStudy {
  const events: StudyEvent[] = []
  const baseline: Record<number, number[]> = {}
  for (const h of horizons) baseline[h] = []
  let observations = 0

  for (const [institutionId, points] of series) {
    for (let i = 0; i < points.length; i++) {
      const current = points[i]
      const priorScore = eventAt(points, i, def)
      const benchAtEvent = benchmark(current.date)
      const raw: HorizonValues = {}
      const excess: HorizonValues = {}
      for (const h of horizons) {
        const future = i + h < points.length ? points[i + h] : undefined
        const r = future ? pctReturn(current.price, future.price) : null
        raw[h] = r
        let x: number | null = null
        if (r !== null && future && benchAtEvent !== null) {
          const benchAtFuture = benchmark(future.date)
          const b =
            benchAtFuture === null
              ? null
              : pctReturn(benchAtEvent, benchAtFuture)
          x = b === null ? null : r - b
        }
        excess[h] = x
        if (priorScore === null && x !== null) baseline[h].push(x)
      }
      observations++
      if (priorScore !== null) {
        events.push({
          institutionId,
          date: current.date,
          score: current.score,
          priorScore,
          raw,
          excess,
        })
      }
    }
  }

  events.sort((a, b) =>
    a.date < b.date
      ? -1
      : a.date > b.date
        ? 1
        : a.institutionId.localeCompare(b.institutionId),
  )
  return {
    events,
    baseline,
    horizons,
    distinctDates: new Set(events.map((event) => event.date)).size,
    distinctBanks: new Set(events.map((event) => event.institutionId)).size,
    observations,
  }
}

export interface HorizonStats {
  horizon: number
  /** Events found. */
  total: number
  /** Events with an excess return at this horizon. */
  n: number
  /** Events with a negative excess return (the short was right). */
  hits: number
  /** Events with a non-zero excess return: the hit-rate denominator. */
  nonTies: number
  /** Percent, over nonTies. */
  hitRate: number | null
  /** Percent bounds (Wilson 95%). */
  hitCI: Interval | null
  /** Non-event observations with an excess return. */
  baseN: number
  baseNonTies: number
  baseHits: number
  /** Percent, over baseNonTies. */
  baseHitRate: number | null
  baseMean: number | null
  avgExcess: number | null
  /** Standard error of avgExcess. */
  se: number | null
  /** Welch t of events against the baseline (one-sample vs 0 when the baseline is too small). */
  t: number | null
  median: number | null
  /** Most negative excess: the best outcome for a short. */
  bestExcess: number | null
  /** Most positive excess: the worst outcome for a short. */
  worstExcess: number | null
  /** n below MIN_EVENTS_PER_HORIZON. */
  insufficient: boolean
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function hitSummary(values: readonly number[]): {
  nonTies: number
  hits: number
  rate: number | null
  ci: Interval | null
} {
  let nonTies = 0
  let hits = 0
  for (const value of values) {
    if (value === 0) continue
    nonTies++
    if (value < 0) hits++
  }
  const ci = wilsonInterval(hits, nonTies)
  return {
    nonTies,
    hits,
    rate: nonTies > 0 ? (hits / nonTies) * 100 : null,
    ci: ci ? { lower: ci.lower * 100, upper: ci.upper * 100 } : null,
  }
}

export function aggregateStats(
  events: readonly StudyEvent[],
  baseline: Readonly<Record<number, readonly number[]>>,
  horizons: readonly number[] = DEFAULT_HORIZONS,
): HorizonStats[] {
  return horizons.map((horizon) => {
    const excess = events.map((event) => event.excess[horizon]).filter(isNumber)
    const base = baseline[horizon] ?? []
    const eventHits = hitSummary(excess)
    const baseHits = hitSummary(base)
    const avgExcess = mean(excess)
    const seValue = standardError(excess)
    const welch = base.length >= 2 ? welchT(excess, base) : null
    const t = welch ? welch.t : base.length >= 2 ? null : tStat(excess)
    return {
      horizon,
      total: events.length,
      n: excess.length,
      hits: eventHits.hits,
      nonTies: eventHits.nonTies,
      hitRate: eventHits.rate,
      hitCI: eventHits.ci,
      baseN: base.length,
      baseNonTies: baseHits.nonTies,
      baseHits: baseHits.hits,
      baseHitRate: baseHits.rate,
      baseMean: mean(base),
      avgExcess,
      se: seValue,
      t,
      median: median(excess),
      bestExcess: excess.length > 0 ? Math.min(...excess) : null,
      worstExcess: excess.length > 0 ? Math.max(...excess) : null,
      insufficient: excess.length < MIN_EVENTS_PER_HORIZON,
    }
  })
}

export type VerdictKind = 'predictive' | 'no-edge' | 'insufficient'

export interface Verdict {
  kind: VerdictKind
  horizon: number
  n: number
  total: number
  needed: number
  t: number | null
  /** Mean excess and the half-width of its 95% interval (Z_95 · SE), in percent. */
  meanPm: { mean: number; halfWidth: number } | null
  hitRate: number | null
  hitCI: Interval | null
  /** Wilson lower bound of the hit rate exceeds the measured baseline hit rate. */
  corroboratedByHitRate: boolean
  baseHitRate: number | null
  baseMean: number | null
  baseN: number
}

/**
 * The page's headline. Primary test: Welch t <= PREDICTIVE_T at the verdict
 * horizon with n >= MIN_EVENTS_FOR_VERDICT. The hit-rate interval against the
 * measured baseline is reported as corroboration, never as an alternative path.
 */
export function verdict(
  stats: readonly HorizonStats[],
  horizon = VERDICT_HORIZON,
): Verdict {
  const row = stats.find((entry) => entry.horizon === horizon)
  const n = row?.n ?? 0
  const t = row?.t ?? null
  const meanPm =
    row && row.avgExcess !== null && row.se !== null
      ? { mean: row.avgExcess, halfWidth: Z_95 * row.se }
      : null
  const corroboratedByHitRate =
    row?.hitCI !== null &&
    row?.hitCI !== undefined &&
    row.baseHitRate !== null &&
    row.hitCI.lower > row.baseHitRate
  const kind: VerdictKind =
    n < MIN_EVENTS_FOR_VERDICT
      ? 'insufficient'
      : t !== null && t <= PREDICTIVE_T
        ? 'predictive'
        : 'no-edge'
  return {
    kind,
    horizon,
    n,
    total: row?.total ?? 0,
    needed: MIN_EVENTS_FOR_VERDICT,
    t,
    meanPm,
    hitRate: row?.hitRate ?? null,
    hitCI: row?.hitCI ?? null,
    corroboratedByHitRate,
    baseHitRate: row?.baseHitRate ?? null,
    baseMean: row?.baseMean ?? null,
    baseN: row?.baseN ?? 0,
  }
}
