import { describe, expect, it } from 'vitest'
import { WATCH } from '@shared/thresholds'
import { fixtureRows } from './fixtures'
import { buildChartSeries, computeLeadLag, highScoreThreshold } from './leadLag'
import { toTradingDaySeries, type SeriesPoint } from './series'

const series = toTradingDaySeries(fixtureRows()).series

describe('highScoreThreshold', () => {
  it('is WATCH for a quiet bank and the 80th percentile when that is higher', () => {
    expect(highScoreThreshold([0, 0, 0, 0, 0])).toBe(WATCH)
    expect(highScoreThreshold([])).toBe(WATCH)
    expect(highScoreThreshold([0, 1, 2, 9, 9.5, 10, 9, 8.5, 8, 7, 6, 5])).toBe(
      9,
    )
  })
})

describe('computeLeadLag', () => {
  it('leaves out banks with fewer observations than minObs', () => {
    expect(computeLeadLag(series, 1, 20)).toEqual([])
    // bank-b has 11 points after its holiday copy is dropped, so 10 lag-1 pairs.
    const ids = (minObs: number) =>
      computeLeadLag(series, 1, minObs)
        .map((row) => row.institutionId)
        .sort()
    expect(ids(11)).toEqual(['bank-a', 'bank-d', 'bank-e', 'bank-f'])
    expect(ids(10)).toEqual(['bank-a', 'bank-b', 'bank-d', 'bank-e', 'bank-f'])
    expect(
      computeLeadLag(series, 1, 1).map((row) => row.institutionId),
    ).toContain('bank-g')
    expect(computeLeadLag(series, 0, 1)).toEqual([])
  })

  it('measures drops after a high score with a Wilson interval and the two conditional means', () => {
    const a = computeLeadLag(series, 1, 5).find(
      (row) => row.institutionId === 'bank-a',
    )!
    expect(a.days).toBe(12)
    expect(a.pairs).toBe(11)
    expect(a.threshold).toBe(9)
    expect(a.highDays).toBe(4)
    expect(a.dropsAfterHigh).toBe(4)
    expect(a.dropRate).toBe(100)
    expect(a.dropCI!.lower).toBeCloseTo(51, 0)
    expect(a.dropCI!.upper).toBe(100)
    expect(a.dropDays).toBe(6)
    expect(a.riseDays).toBe(5)
    expect(a.avgScoreBeforeDrop).toBeCloseTo(8, 12)
    expect(a.avgScoreBeforeRise).toBeCloseTo(4.4, 12)
    expect(a.rhoN).toBe(11)
    expect(a.rho).not.toBeNull()
    expect(a.rho!).toBeLessThan(0) // high scores sat on the falling stretch
  })

  it('reports no high days for a bank that never reaches its threshold', () => {
    const b = computeLeadLag(series, 1, 5).find(
      (row) => row.institutionId === 'bank-b',
    )!
    // Eight 2s and three 9s: the 80th percentile (index 8 of 11) is 9, above WATCH.
    expect(b.threshold).toBe(9)
    expect(b.threshold).toBeGreaterThan(WATCH)
    expect(b.highDays).toBe(3) // the first three rows are 9 and the price rose after each
    expect(b.dropsAfterHigh).toBe(0)
    expect(b.dropRate).toBe(0)
    const d = computeLeadLag(series, 3, 5).find(
      (row) => row.institutionId === 'bank-d',
    )!
    expect(d.pairs).toBe(9)
    expect(d.dropRate).toBe(100)
  })

  it('treats a price change of exactly zero as neither drop nor rise', () => {
    const flat: SeriesPoint[] = [
      { date: '2026-06-01', score: 9, price: 10, changePct: null },
      { date: '2026-06-02', score: 9, price: 10, changePct: 0 },
      { date: '2026-06-03', score: 9, price: 9, changePct: -10 },
      { date: '2026-06-04', score: 0, price: 9, changePct: 0 },
      { date: '2026-06-05', score: 0, price: 11, changePct: 22 },
    ]
    const [row] = computeLeadLag(new Map([['flat', flat]]), 1, 1)
    expect(row.highDays).toBe(1) // Jun 1 -> Jun 2 is flat and drops out; Jun 2 -> Jun 3 falls
    expect(row.dropsAfterHigh).toBe(1)
    expect(row.dropDays).toBe(1)
    expect(row.riseDays).toBe(1)
    expect(row.rhoN).toBe(4)
  })

  it('has a null rho below three pairs', () => {
    const g = computeLeadLag(series, 1, 1).find(
      (row) => row.institutionId === 'bank-g',
    )!
    expect(g.pairs).toBe(1)
    expect(g.rho).toBeNull()
    expect(g.rhoN).toBe(1)
  })
})

describe('buildChartSeries', () => {
  it('indexes the price to 100 on the first day as numbers', () => {
    const points = buildChartSeries(series.get('bank-a')!)
    expect(points).toHaveLength(12)
    expect(points[0]).toEqual({ date: '2026-06-01', score: 0, price: 100 })
    expect(points[4]).toEqual({ date: '2026-06-05', score: 9.5, price: 98 })
    expect(typeof points[11].price).toBe('number')
  })

  it('is empty without a positive price', () => {
    expect(buildChartSeries([])).toEqual([])
    expect(
      buildChartSeries([
        { date: '2026-06-01', score: 1, price: 0, changePct: null },
      ]),
    ).toEqual([])
  })
})
