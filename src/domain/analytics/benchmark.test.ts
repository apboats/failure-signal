import { describe, expect, it } from 'vitest'
import {
  benchmarkReturn,
  buildBenchmarkIndex,
  lastIndexAtOrBefore,
} from './benchmark'
import { fixtureBenchmarks } from './fixtures'

describe('lastIndexAtOrBefore', () => {
  it('finds the last element at or below the target by binary search', () => {
    const days = [1, 3, 5, 7, 9]
    expect(lastIndexAtOrBefore(days, 0)).toBe(-1)
    expect(lastIndexAtOrBefore(days, 1)).toBe(0)
    expect(lastIndexAtOrBefore(days, 4)).toBe(1)
    expect(lastIndexAtOrBefore(days, 9)).toBe(4)
    expect(lastIndexAtOrBefore(days, 100)).toBe(4)
    expect(lastIndexAtOrBefore([], 1)).toBe(-1)
  })
})

describe('buildBenchmarkIndex', () => {
  const index = buildBenchmarkIndex(fixtureBenchmarks())

  it('keeps one sorted series per ticker', () => {
    expect(index.tickers).toEqual(['XLF'])
    expect(index.size('XLF')).toBe(9)
    expect(index.size('SPY')).toBe(0)
  })

  it('returns the exact close when the date is present', () => {
    expect(index.asOf('XLF', '2026-06-02')).toBe(40.4)
    expect(index.asOf('XLF', '2026-06-16')).toBe(39)
  })

  it('falls back to the last close within four calendar days and null beyond', () => {
    expect(index.asOf('XLF', '2026-06-09')).toBe(39.6) // gap 1 from Jun 8
    expect(index.asOf('XLF', '2026-06-12')).toBe(39.6) // gap 4
    expect(index.asOf('XLF', '2026-06-15')).toBeNull() // gap 7
    expect(index.asOf('XLF', '2026-05-31')).toBeNull() // before the first close
  })

  it('is null for an unknown ticker or a malformed date', () => {
    expect(index.asOf('SPY', '2026-06-02')).toBeNull()
    expect(index.asOf('XLF', 'June 2')).toBeNull()
  })

  it('hands out a stable lookup per ticker', () => {
    const lookup = index.lookup('XLF')
    expect(index.lookup('XLF')).toBe(lookup)
    expect(lookup('2026-06-04')).toBe(40)
    expect(benchmarkReturn(lookup, '2026-06-04', '2026-06-05')).toBeCloseTo(
      -0.5,
      12,
    )
    expect(benchmarkReturn(lookup, '2026-06-04', '2026-06-15')).toBeNull()
  })

  it('lets the later row win on a duplicated date and skips non-positive prices', () => {
    const dup = buildBenchmarkIndex([
      { ticker: 'SPY', snapshot_date: '2026-06-01', price: 1 },
      { ticker: 'SPY', snapshot_date: '2026-06-01', price: 2 },
      { ticker: 'SPY', snapshot_date: '2026-06-02', price: 0 },
      { ticker: 'SPY', snapshot_date: 'bad', price: 5 },
    ])
    expect(dup.size('SPY')).toBe(1)
    expect(dup.asOf('SPY', '2026-06-01')).toBe(2)
    expect(dup.asOf('SPY', '2026-06-02')).toBe(2)
  })

  it('honours a custom maximum gap', () => {
    const strict = buildBenchmarkIndex(fixtureBenchmarks(), 0)
    expect(strict.asOf('XLF', '2026-06-08')).toBe(39.6)
    expect(strict.asOf('XLF', '2026-06-09')).toBeNull()
  })
})
