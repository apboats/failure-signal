import { describe, expect, it } from 'vitest'
import type { SnapshotPoint } from '@/api/snapshots'
import { WATCH } from '@shared/thresholds'
import type {
  AlertHistory,
  Institution,
  LatestScore,
  RiskSignal,
  TradingSignal,
} from '@shared/types'
import {
  businessDaysBehind,
  isSameUtcDay,
  pricesTone,
  scoresTone,
  signalsTone,
} from './freshness'
import {
  buildRows,
  countTiles,
  matchesSearch,
  matchesTile,
  mergeEvents,
  sectorLabel,
  topMovers,
  utcDate,
} from './useWatchlistData'

/* Wednesday 2026-11-18 21:30 UTC, after the 21:15 scoring run. */
const NOW = Date.UTC(2026, 10, 18, 21, 30)
const HOUR = 60 * 60 * 1000

const institution = (
  id: string,
  ticker: string | null,
  name: string,
  is_active = true,
  sector = 'banking',
): Institution => ({
  id,
  name,
  ticker,
  sector,
  description: null,
  logo_url: null,
  is_active,
  cik: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const score = (
  institution_id: string,
  value: number | null,
  computed_at = '2026-11-18T21:15:00Z',
): LatestScore => ({
  institution_id,
  score: value,
  score_components: null,
  signal_count: value === null ? null : 1,
  computed_at: value === null ? null : computed_at,
})

const snapshot = (
  institution_id: string,
  snapshot_date: string,
  risk_score: number,
  stock_price: number | null = null,
  stock_change_pct: number | null = null,
): SnapshotPoint => ({
  institution_id,
  snapshot_date,
  risk_score,
  stock_price,
  stock_change_pct,
})

const signal = (
  id: string,
  institution_id: string,
  signal_date: string,
): RiskSignal => ({
  id,
  institution_id,
  news_article_id: null,
  category: 'social_panic',
  severity: 'medium',
  title: `Signal ${id}`,
  description: null,
  signal_value: null,
  signal_date,
  source: null,
  is_confirmed: false,
  created_at: signal_date,
})

const trade = (
  id: string,
  institution_id: string,
  signal_type: TradingSignal['signal_type'],
  is_active = true,
): TradingSignal => ({
  id,
  institution_id,
  signal_type,
  score_at_signal: 16,
  score_change: 6,
  price_at_signal: null,
  reason: 'test',
  is_active,
  created_at: '2026-11-18T22:00:00Z',
})

const alert = (
  id: string,
  institution_id: string,
  created_at: string,
): AlertHistory => ({
  id,
  alert_config_id: 'cfg',
  institution_id,
  triggered_score: 9.5,
  trigger_reason: 'Score crossed 8',
  acknowledged_at: null,
  created_at,
})

describe('buildRows', () => {
  const institutions = [
    institution('jpm', 'JPM', 'JPMorgan Chase'),
    institution('new', 'NEW', 'Never Scored Bank'),
    institution('old', 'OLD', 'Retired Bank', false),
  ]
  const scores = new Map<string, LatestScore>([
    ['jpm', score('jpm', 6.4)],
    ['old', score('old', 1)],
  ])
  const snapshots = [
    snapshot('jpm', '2026-11-10', 2),
    snapshot('jpm', '2026-11-11', 3, 100, 1),
    snapshot('jpm', '2026-11-16', 4, 101, 0.5),
    snapshot('jpm', '2026-11-17', 5.2, null, null),
    snapshot('new', '2026-11-17', 0, 50, -1),
  ]
  const signals = [
    signal('a', 'jpm', '2026-11-18T20:00:00Z'),
    signal('b', 'jpm', '2026-11-14T20:00:00Z'),
    signal('c', 'new', '2026-11-18T10:00:00Z'),
  ]
  const trades = [
    trade('t1', 'jpm', 'short_exit'),
    trade('t2', 'jpm', 'watch'),
    trade('t3', 'new', 'short_entry', false),
  ]
  const rows = buildRows({
    institutions,
    scores,
    snapshots,
    signals,
    tradingSignals: trades,
    now: NOW,
  })
  const jpm = rows[0]
  const fresh = rows[1]
  const retired = rows[2]

  it('keeps every institution, active or not, in input order', () => {
    expect(rows.map((row) => row.id)).toEqual(['jpm', 'new', 'old'])
    expect(retired.isActive).toBe(false)
    expect(retired.score).toBe(1)
  })

  it('takes Δ24h from yesterday’s snapshot and Δ7d from the one 7 days back', () => {
    // yesterday = 2026-11-17 (5.2), a week ago = 2026-11-11 (3)
    expect(jpm.d24).toBeCloseTo(6.4 - 5.2)
    expect(jpm.d7).toBeCloseTo(6.4 - 3)
    expect(jpm.sparkline).toEqual([2, 3, 4, 5.2])
  })

  it('uses the newest priced snapshot, skipping unpriced days', () => {
    expect(jpm.price).toBe(101)
    expect(jpm.priceChangePct).toBe(0.5)
    expect(jpm.priceDate).toBe('2026-11-16')
  })

  it('never coalesces a missing score to 0', () => {
    expect(fresh.score).toBeNull()
    expect(fresh.computedAt).toBeNull()
    expect(fresh.d24).toBeNull()
    expect(fresh.d7).toBeNull()
    expect(fresh.price).toBe(50)
  })

  it('counts signals in 7 d and 24 h per bank', () => {
    expect(jpm.signals7d).toBe(2)
    expect(jpm.signals24h).toBe(1)
    expect(fresh.signals7d).toBe(1)
    expect(fresh.signals24h).toBe(1)
    expect(retired.signals7d).toBe(0)
  })

  it('keeps only active short_entry / watch trade signals', () => {
    expect(jpm.tradeSignal).toBe('watch')
    expect(fresh.tradeSignal).toBeNull()
  })

  it('renders empty cells while the secondary queries are still undefined', () => {
    const [row] = buildRows({ institutions: [institutions[0]], now: NOW })
    expect(row.score).toBeNull()
    expect(row.sparkline).toEqual([])
    expect(row.signals7d).toBe(0)
    expect(row.price).toBeNull()
  })

  describe('tiles and filters', () => {
    const active = rows.filter((row) => row.isActive)
    const tiles = countTiles(active, signals, trades, NOW)

    it('counts scored / elevated / signals 24h / active trade signals', () => {
      expect(tiles).toEqual({
        scored: 1,
        total: 2,
        elevated: 0,
        signals24h: 2,
        tradeSignals: 1,
      })
    })

    it('matchesTile mirrors the tile definitions', () => {
      expect(matchesTile(jpm, 'scored')).toBe(true)
      expect(matchesTile(fresh, 'scored')).toBe(false)
      expect(matchesTile({ ...jpm, score: WATCH }, 'elevated')).toBe(true)
      expect(matchesTile({ ...jpm, score: WATCH - 0.1 }, 'elevated')).toBe(
        false,
      )
      expect(matchesTile(jpm, 'signals24h')).toBe(true)
      expect(matchesTile(retired, 'signals24h')).toBe(false)
      expect(matchesTile(jpm, 'trade')).toBe(true)
      expect(matchesTile(fresh, 'trade')).toBe(false)
      expect(matchesTile(fresh, null)).toBe(true)
    })

    it('matchesSearch is case-insensitive over ticker and name', () => {
      expect(matchesSearch(jpm, 'jpm')).toBe(true)
      expect(matchesSearch(jpm, 'morgan')).toBe(true)
      expect(matchesSearch(jpm, '  JPM ')).toBe(true)
      expect(matchesSearch(fresh, 'JPM')).toBe(false)
      expect(matchesSearch(fresh, '')).toBe(true)
    })
  })
})

describe('topMovers', () => {
  it('orders by absolute Δ24h, drops rows without a delta, and caps at 5', () => {
    const base = buildRows({
      institutions: Array.from({ length: 8 }, (_, i) =>
        institution(`b${i}`, `B${i}`, `Bank ${i}`),
      ),
      now: NOW,
    })
    const rows = base.map((row, i) => ({
      ...row,
      score: i,
      d24: i === 7 ? null : [0, -3, 1, 2.5, -0.5, 0.2, 2.5][i],
    }))
    expect(topMovers(rows).map((row) => row.id)).toEqual([
      'b1',
      'b6',
      'b3',
      'b2',
      'b4',
    ])
  })
})

describe('mergeEvents', () => {
  it('merges signals and alerts newest first and caps at the limit', () => {
    const events = mergeEvents(
      [
        signal('s1', 'jpm', '2026-11-18T20:00:00Z'),
        signal('s2', 'jpm', '2026-11-18T10:00:00Z'),
      ],
      [alert('a1', 'jpm', '2026-11-18T15:00:00Z')],
      2,
    )
    expect(events.map((event) => event.id)).toEqual(['signal:s1', 'alert:a1'])
    expect(mergeEvents(undefined, undefined)).toEqual([])
  })
})

describe('freshness', () => {
  it('scores: on time within 2 h, amber past 2 h, red past 6 h', () => {
    expect(scoresTone(new Date(NOW - 15 * 60 * 1000).toISOString(), NOW)).toBe(
      'ok',
    )
    expect(scoresTone(new Date(NOW - 3 * HOUR).toISOString(), NOW)).toBe('late')
    expect(scoresTone(new Date(NOW - 7 * HOUR).toISOString(), NOW)).toBe(
      'stale',
    )
    expect(scoresTone(null, NOW)).toBe('missing')
  })

  it('businessDaysBehind skips weekends', () => {
    const monday = Date.UTC(2026, 10, 16, 12)
    const tuesday = Date.UTC(2026, 10, 17, 12)
    expect(businessDaysBehind('2026-11-13', monday)).toBe(1) // Fri -> Mon
    expect(businessDaysBehind('2026-11-13', tuesday)).toBe(2) // Fri -> Tue
    expect(businessDaysBehind('2026-11-17', tuesday)).toBe(0)
    expect(businessDaysBehind('2026-11-17', NOW)).toBe(1) // Tue -> Wed
    expect(businessDaysBehind('2026-11-14', monday)).toBe(1) // Sat -> Mon
    expect(businessDaysBehind('2026-11-20', monday)).toBe(0) // future
  })

  it('prices: amber only past one business day behind, red past three', () => {
    expect(pricesTone('2026-11-17', NOW)).toBe('ok')
    expect(pricesTone('2026-11-16', NOW)).toBe('late')
    expect(pricesTone('2026-11-12', NOW)).toBe('stale') // Thu -> Wed = 4
    expect(pricesTone('2026-11-13', Date.UTC(2026, 10, 16, 12))).toBe('ok')
    expect(pricesTone(null, NOW)).toBe('missing')
  })

  it('signals are informational and dates compare in UTC', () => {
    expect(signalsTone('2026-11-10T00:00:00Z')).toBe('info')
    expect(signalsTone(null)).toBe('missing')
    expect(isSameUtcDay('2026-11-18T00:10:00Z', NOW)).toBe(true)
    expect(isSameUtcDay('2026-11-17T23:50:00Z', NOW)).toBe(false)
    expect(utcDate(NOW)).toBe('2026-11-18')
  })
})

describe('sectorLabel', () => {
  it('humanises the enum-ish sector strings', () => {
    expect(sectorLabel('investment_bank')).toBe('Investment bank')
    expect(sectorLabel('banking')).toBe('Banking')
  })
})
