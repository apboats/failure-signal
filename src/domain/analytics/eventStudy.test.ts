import { describe, expect, it } from 'vitest'
import { buildBenchmarkIndex } from './benchmark'
import {
  aggregateStats,
  DEFAULT_HORIZONS,
  detectEvents,
  eventAt,
  MIN_EVENTS_FOR_VERDICT,
  pctReturn,
  verdict,
  type HorizonStats,
} from './eventStudy'
import { fixtureBenchmarks, fixtureRows } from './fixtures'
import { toTradingDaySeries } from './series'

const series = toTradingDaySeries(fixtureRows()).series
const xlf = buildBenchmarkIndex(fixtureBenchmarks()).lookup('XLF')
const level40 = { kind: 'level', threshold: 40 } as const

describe('eventAt', () => {
  const a = series.get('bank-a')!

  it('level: fires on the first crossing only, with the previous day as the prior', () => {
    expect(eventAt(a, 3, level40)).toBe(10)
    for (const i of [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11])
      expect(eventAt(a, i, level40)).toBeNull()
  })

  it('level: never fires on the first row (no prior observation)', () => {
    const b = series.get('bank-b')!
    expect(b[0].score).toBe(45)
    expect(eventAt(b, 0, level40)).toBeNull()
  })

  it('level: needs the prior within four calendar days', () => {
    const g = series.get('bank-g')!
    expect(g[1].score).toBe(45)
    expect(eventAt(g, 1, level40)).toBeNull()
  })

  it('velocity: fires once per spike even when the delta condition holds for days', () => {
    const def = { kind: 'velocity', delta: 25, windowDays: 5 } as const
    const fired = a.map((_, i) => eventAt(a, i, def))
    expect(fired.filter((prior) => prior !== null)).toHaveLength(1)
    expect(fired[5]).toBe(0) // Jun 8: 50 − 0 over five rows
    expect(fired[6]).toBeNull() // 45 − 5 = 40 still holds, but so did yesterday
    expect(fired[7]).toBeNull()
  })

  it('velocity: with a two-day window the plateau still fires once', () => {
    const def = { kind: 'velocity', delta: 25, windowDays: 2 } as const
    const fired = a.map((_, i) => eventAt(a, i, def))
    expect(fired.filter((prior) => prior !== null)).toHaveLength(1)
    expect(fired[3]).toBe(5)
  })

  it('velocity: a lookback before the series start is not an event', () => {
    const def = { kind: 'velocity', delta: 25, windowDays: 20 } as const
    expect(a.every((_, i) => eventAt(a, i, def) === null)).toBe(true)
  })
})

describe('pctReturn', () => {
  it('is a percent and null for a non-positive base', () => {
    expect(pctReturn(100, 98)).toBe(-2)
    expect(pctReturn(0, 5)).toBeNull()
    expect(pctReturn(10, Number.NaN)).toBeNull()
  })
})

describe('detectEvents (level 40)', () => {
  const study = detectEvents(series, level40, xlf)

  it('finds four crossings on three distinct dates across four banks', () => {
    expect(
      study.events.map((event) => `${event.institutionId}@${event.date}`),
    ).toEqual([
      'bank-d@2026-06-02',
      'bank-a@2026-06-04',
      'bank-e@2026-06-08',
      'bank-f@2026-06-08',
    ])
    expect(study.distinctDates).toBe(3)
    expect(study.distinctBanks).toBe(4)
    expect(study.observations).toBe(12 * 4 + 11 + 2)
    expect(study.horizons).toBe(DEFAULT_HORIZONS)
  })

  it('computes raw and market-relative excess returns per horizon', () => {
    const a = study.events.find((event) => event.institutionId === 'bank-a')!
    expect(a.score).toBe(45)
    expect(a.priorScore).toBe(10)
    expect(a.raw[1]).toBeCloseTo(-2, 12)
    expect(a.excess[1]).toBeCloseTo(-2 - -0.5, 12)
    expect(a.raw[5]).toBeCloseTo(-6, 12)
    expect(a.excess[5]).toBeCloseTo(-6 - -1, 12) // benchmark as-of Jun 11 is Jun 8
    expect(a.raw[10]).toBeNull() // past the end of the series
    expect(a.excess[10]).toBeNull()
    expect(a.excess[20]).toBeNull()
  })

  it('leaves excess null when the benchmark is missing although the stock return exists', () => {
    const e = study.events.find((event) => event.institutionId === 'bank-e')!
    expect(e.raw[5]).not.toBeNull() // Jun 15 has a stock row
    expect(e.excess[5]).toBeNull() // but no benchmark within four days
  })

  it('feeds every non-event day with a benchmark into the baseline', () => {
    // Per 12-day bank, 1d excess exists for i in 0..8 (i = 9 lands on Jun 15 with
    // no benchmark, i = 10 starts there): 9 rows, minus one event row each for
    // bank-a/d/e/f (8 each). bank-b has 11 points with Jun 16 at index 10, so
    // i = 0..9 all resolve (10). bank-g: one pair (Jun 1 -> Jun 10, as-of Jun 8).
    expect(study.baseline[1]).toHaveLength(8 * 4 + 10 + 1)
    for (const h of DEFAULT_HORIZONS)
      expect(study.baseline[h].every((value) => Number.isFinite(value))).toBe(
        true,
      )
    expect(study.baseline[20]).toHaveLength(0)
  })

  it('returns no events and empty baselines for an empty series', () => {
    const empty = detectEvents(new Map(), level40, xlf)
    expect(empty.events).toEqual([])
    expect(empty.distinctDates).toBe(0)
    expect(empty.baseline[5]).toEqual([])
  })
})

describe('aggregateStats', () => {
  const study = detectEvents(series, level40, xlf)
  const stats = aggregateStats(study.events, study.baseline, study.horizons)
  const at = (h: number) => stats.find((row) => row.horizon === h)!

  it('counts events with a benchmark in n and all events in total', () => {
    expect(at(1).total).toBe(4)
    expect(at(1).n).toBe(4)
    expect(at(5).total).toBe(4)
    expect(at(5).n).toBe(2) // bank-e and bank-f lose their 5d benchmark
    expect(at(10).n).toBe(1)
    expect(at(20).n).toBe(0)
  })

  it('takes the even-n median as the average of the middle pair', () => {
    const five = at(5)
    const values = study.events
      .map((event) => event.excess[5])
      .filter((value): value is number => value !== null)
    expect(values).toHaveLength(2)
    expect(five.median).toBeCloseTo((values[0] + values[1]) / 2, 12)
    expect(five.bestExcess).toBe(Math.min(...values))
    expect(five.worstExcess).toBe(Math.max(...values))
  })

  it('excludes exact-zero excess from the hit-rate denominator', () => {
    const rows = aggregateStats(
      [
        event('x', { 1: -1 }),
        event('y', { 1: 0 }),
        event('z', { 1: 2 }),
        event('w', { 1: null }),
      ],
      { 1: [0, 0, -1, 1, 1] },
      [1],
    )
    expect(rows[0].n).toBe(3)
    expect(rows[0].nonTies).toBe(2)
    expect(rows[0].hits).toBe(1)
    expect(rows[0].hitRate).toBe(50)
    expect(rows[0].baseN).toBe(5)
    expect(rows[0].baseNonTies).toBe(3)
    expect(rows[0].baseHitRate).toBeCloseTo(100 / 3, 12)
  })

  it('reports Wilson bounds in percent and flags n < 10 as insufficient', () => {
    const one = at(1)
    expect(one.hits).toBe(4)
    expect(one.hitRate).toBe(100)
    expect(one.hitCI!.lower).toBeCloseTo(51, 0)
    expect(one.hitCI!.upper).toBe(100)
    expect(one.insufficient).toBe(true)
    expect(at(20).hitRate).toBeNull()
    expect(at(20).hitCI).toBeNull()
    expect(at(20).avgExcess).toBeNull()
  })

  it('tests the event mean against the baseline with Welch t', () => {
    const one = at(1)
    expect(one.baseN).toBe(43)
    expect(one.baseMean).not.toBeNull()
    expect(one.se).not.toBeNull()
    expect(one.t).not.toBeNull()
    expect(one.t!).toBeLessThan(0)
  })
})

function event(id: string, excess: Record<number, number | null>) {
  return {
    institutionId: id,
    date: '2026-06-01',
    score: 9,
    priorScore: 1,
    raw: excess,
    excess,
  }
}

function statsRow(overrides: Partial<HorizonStats>): HorizonStats {
  return {
    horizon: 5,
    total: 40,
    n: 40,
    hits: 28,
    nonTies: 40,
    hitRate: 70,
    hitCI: { lower: 55, upper: 82 },
    baseN: 5000,
    baseNonTies: 4900,
    baseHits: 2450,
    baseHitRate: 50,
    baseMean: -0.1,
    avgExcess: -1.5,
    se: 0.5,
    t: -2.8,
    median: -1.2,
    bestExcess: -9,
    worstExcess: 4,
    insufficient: false,
    ...overrides,
  }
}

describe('verdict', () => {
  it('is insufficient below thirty events at 5d, with the measured baseline attached', () => {
    const study = detectEvents(series, level40, xlf)
    const result = verdict(aggregateStats(study.events, study.baseline))
    expect(result.kind).toBe('insufficient')
    expect(result.horizon).toBe(5)
    expect(result.n).toBe(2)
    expect(result.total).toBe(4)
    expect(result.needed).toBe(MIN_EVENTS_FOR_VERDICT)
    expect(result.meanPm).not.toBeNull()
    expect(result.meanPm!.halfWidth).toBeCloseTo(
      1.96 * 0.5 * Math.abs(-5 - -6.4356),
      1,
    )
    expect(result.baseHitRate).not.toBeNull()
    expect(result.baseN).toBeGreaterThan(0)
  })

  it('is predictive only on t <= −2 with n >= 30; the hit-rate bound is corroboration', () => {
    expect(verdict([statsRow({})])).toMatchObject({
      kind: 'predictive',
      corroboratedByHitRate: true,
      meanPm: { mean: -1.5, halfWidth: 0.98 },
    })
    expect(verdict([statsRow({ t: -1.2 })]).kind).toBe('no-edge')
    // A hit rate above baseline on its own does not make the verdict predictive.
    expect(
      verdict([statsRow({ t: -0.5, hitCI: { lower: 60, upper: 80 } })]).kind,
    ).toBe('no-edge')
    expect(verdict([statsRow({ n: 29 })]).kind).toBe('insufficient')
    expect(verdict([statsRow({ t: null })]).kind).toBe('no-edge')
    expect(
      verdict([statsRow({ hitCI: { lower: 45, upper: 70 } })])
        .corroboratedByHitRate,
    ).toBe(false)
  })

  it('handles a missing horizon row', () => {
    const result = verdict([statsRow({ horizon: 1 })], 5)
    expect(result.kind).toBe('insufficient')
    expect(result.n).toBe(0)
    expect(result.meanPm).toBeNull()
    expect(result.corroboratedByHitRate).toBe(false)
  })
})
