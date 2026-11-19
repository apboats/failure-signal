import { describe, expect, it } from 'vitest'
import { fixtureIndex, fixtureRows, TRADING_DAYS } from './fixtures'
import {
  calendarGap,
  computeDataWindow,
  dayNumber,
  groupByInstitution,
  isWeekend,
  toTradingDaySeries,
} from './series'

describe('dayNumber / calendarGap / isWeekend', () => {
  it('counts UTC days and spots weekends without a time zone', () => {
    expect(dayNumber('1970-01-01')).toBe(0)
    expect(dayNumber('1970-01-04')).toBe(3)
    expect(isWeekend('1970-01-04')).toBe(true) // Sunday
    expect(isWeekend('2026-06-06')).toBe(true) // Saturday
    expect(isWeekend('2026-06-07')).toBe(true)
    expect(isWeekend('2026-06-08')).toBe(false) // Monday
    expect(isWeekend('not a date')).toBe(false)
    expect(calendarGap('2026-06-05', '2026-06-08')).toBe(3)
    expect(calendarGap('2026-06-01', '2026-06-10')).toBe(9)
    expect(Number.isNaN(dayNumber('2026/06/01'))).toBe(true)
  })
})

describe('groupByInstitution', () => {
  it('groups and sorts each bank ascending by date', () => {
    const groups = groupByInstitution(fixtureRows())
    expect(groups.size).toBe(6)
    const a = groups.get('bank-a')!
    expect(a).toHaveLength(16)
    expect(a[0].snapshot_date).toBe('2026-06-01')
    expect(a[a.length - 1].snapshot_date).toBe('2026-06-16')
    for (let i = 1; i < a.length; i++)
      expect(a[i].snapshot_date > a[i - 1].snapshot_date).toBe(true)
  })
})

describe('toTradingDaySeries', () => {
  const result = toTradingDaySeries(fixtureRows())

  it('drops the weekend rows and keeps the twelve trading days in order', () => {
    expect(result.droppedWeekend).toBe(20)
    const a = result.series.get('bank-a')!
    expect(a.map((point) => point.date)).toEqual(TRADING_DAYS)
    expect(a[3]).toEqual({
      date: '2026-06-04',
      score: 9,
      price: 100,
      changePct: -1.96,
    })
  })

  it('drops a weekday row that copies the previous price and change (holiday copy)', () => {
    expect(result.droppedDuplicates).toBe(1)
    const b = result.series.get('bank-b')!
    expect(b).toHaveLength(11)
    expect(b.map((point) => point.date)).not.toContain('2026-06-15')
    expect(b[10].date).toBe('2026-06-16')
  })

  it('keeps a bank with a wide gap and reports the kept total', () => {
    expect(result.series.get('bank-g')).toHaveLength(2)
    expect(result.tradingDays).toBe(12 * 4 + 11 + 2)
  })

  it('returns an empty map for no rows', () => {
    const empty = toTradingDaySeries([])
    expect(empty.series.size).toBe(0)
    expect(empty.tradingDays).toBe(0)
  })
})

describe('computeDataWindow', () => {
  it('keeps active banks, excludes inactive and unknown ones, and spans the kept dates', () => {
    const window = computeDataWindow(fixtureRows(), fixtureIndex())
    expect(window.rows).toHaveLength(5 * 16)
    expect(window.banks).toBe(5)
    expect(window.excludedInactiveRows).toBe(2)
    expect(window.excludedInactiveBanks).toBe(1)
    expect(window.from).toBe('2026-06-01')
    expect(window.to).toBe('2026-06-16')
  })

  it('treats an id missing from the index as inactive', () => {
    const index = fixtureIndex()
    index.delete('bank-a')
    const window = computeDataWindow(fixtureRows(), index)
    expect(window.banks).toBe(4)
    expect(window.excludedInactiveBanks).toBe(2)
    expect(window.excludedInactiveRows).toBe(2 + 16)
  })

  it('reports nulls for an empty window', () => {
    const window = computeDataWindow([], fixtureIndex())
    expect(window).toEqual({
      rows: [],
      from: null,
      to: null,
      banks: 0,
      excludedInactiveRows: 0,
      excludedInactiveBanks: 0,
    })
  })
})
