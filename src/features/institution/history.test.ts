import { describe, expect, it } from 'vitest'
import {
  delta24h,
  describeWindow,
  isStaleScore,
  scoreBefore,
  STALE_SCORE_MS,
  utcDate,
  withLatestPoint,
} from './history'

const points = [
  { date: '2026-11-15', score: 4.0 },
  { date: '2026-11-16', score: 5.5 },
  { date: '2026-11-17', score: 6.0 },
]

describe('utcDate', () => {
  it('uses the UTC calendar day, not the local one', () => {
    expect(utcDate('2026-11-18T21:15:05.225+00:00')).toBe('2026-11-18')
    expect(utcDate('2026-11-18T23:30:00-05:00')).toBe('2026-11-19')
  })

  it('returns null for an unparsable timestamp', () => {
    expect(utcDate('not a date')).toBeNull()
  })
})

describe('withLatestPoint', () => {
  it('appends the hourly score when its day is after the last snapshot', () => {
    const result = withLatestPoint(points, {
      score: 6.4,
      computedAt: '2026-11-18T21:15:00Z',
    })
    expect(result).toHaveLength(4)
    expect(result.at(-1)).toEqual({ date: '2026-11-18', score: 6.4 })
    expect(points).toHaveLength(3)
  })

  it('replaces the last snapshot when the hourly score is from the same day', () => {
    const result = withLatestPoint(points, {
      score: 6.4,
      computedAt: '2026-11-17T22:15:00Z',
    })
    expect(result).toHaveLength(3)
    expect(result.at(-1)).toEqual({ date: '2026-11-17', score: 6.4 })
  })

  it('leaves the series alone when the hourly score is older than the last snapshot', () => {
    const result = withLatestPoint(points, {
      score: 9.9,
      computedAt: '2026-11-10T21:15:00Z',
    })
    expect(result).toEqual(points)
  })

  it('returns the snapshots as they are without a latest score', () => {
    expect(withLatestPoint(points, undefined)).toEqual(points)
    expect(withLatestPoint(points, null)).toEqual(points)
    expect(withLatestPoint(points, { score: null, computedAt: null })).toEqual(
      points,
    )
  })

  it('makes a one-point series for a bank with a score but no snapshots', () => {
    expect(
      withLatestPoint([], { score: 1.2, computedAt: '2026-11-18T21:15:00Z' }),
    ).toEqual([{ date: '2026-11-18', score: 1.2 }])
  })
})

describe('scoreBefore', () => {
  it('finds the newest point strictly before the date', () => {
    expect(scoreBefore(points, '2026-11-18')).toBe(6.0)
    expect(scoreBefore(points, '2026-11-17')).toBe(5.5)
  })

  it('is null when nothing precedes the date', () => {
    expect(scoreBefore(points, '2026-11-15')).toBeNull()
    expect(scoreBefore([], '2026-11-18')).toBeNull()
  })
})

describe('delta24h', () => {
  it('is the latest score minus the snapshot before its UTC day', () => {
    expect(
      delta24h(points, { score: 6.4, computedAt: '2026-11-18T21:15:00Z' }),
    ).toBeCloseTo(0.4)
    expect(
      delta24h(points, { score: 6.4, computedAt: '2026-11-17T22:15:00Z' }),
    ).toBeCloseTo(0.9)
  })

  it('is null without a score or without an earlier snapshot', () => {
    expect(delta24h(points, undefined)).toBeNull()
    expect(delta24h(points, { score: null, computedAt: null })).toBeNull()
    expect(
      delta24h([], { score: 6.4, computedAt: '2026-11-18T21:15:00Z' }),
    ).toBeNull()
  })
})

describe('isStaleScore', () => {
  const now = Date.parse('2026-11-18T22:00:00Z')

  it('flags a score older than two hours', () => {
    expect(isStaleScore('2026-11-18T21:15:00Z', now)).toBe(false)
    expect(isStaleScore('2026-11-18T19:59:00Z', now)).toBe(true)
    expect(
      isStaleScore(new Date(now - STALE_SCORE_MS).toISOString(), now),
    ).toBe(false)
  })

  it('never flags a missing or unparsable timestamp', () => {
    expect(isStaleScore(null, now)).toBe(false)
    expect(isStaleScore('nope', now)).toBe(false)
  })
})

describe('describeWindow', () => {
  it('states the count and the first and last dates', () => {
    expect(describeWindow(points)).toBe('3 points · Nov 15 – Nov 17, 2026')
  })

  it('adds the year to the start date when the window spans years', () => {
    expect(
      describeWindow([
        { date: '2025-12-30', score: 1 },
        { date: '2026-01-02', score: 2 },
      ]),
    ).toBe('2 points · Dec 30, 2025 – Jan 2, 2026')
  })

  it('has a fallback for an empty series', () => {
    expect(describeWindow([])).toBe('No points')
  })
})
