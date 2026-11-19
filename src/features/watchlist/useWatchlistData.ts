import type { UseQueryResult } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import type { SnapshotPoint } from '@/api/snapshots'
import { isElevated, scoreDelta } from '@/domain/risk'
import { useAlertHistory } from '@/queries/useAlerts'
import { useInstitutions } from '@/queries/useInstitutions'
import { useLatestScores } from '@/queries/useLatestScores'
import { useLatestSignals, useRecentSignals } from '@/queries/useSignals'
import { useSnapshots } from '@/queries/useSnapshots'
import { useTradingSignals } from '@/queries/useTradingSignals'
import type {
  AlertHistory,
  Institution,
  LatestScore,
  RiskSignal,
  TradingSignal,
  TradingSignalType,
} from '@shared/types'

/** Daily snapshots fetched for sparklines and the Δ24h / Δ7d baselines. */
export const SPARKLINE_DAYS = 30
/** Window of the "Signals 7d" column and the 24 h tile. */
export const SIGNAL_WINDOW_DAYS = 7
/** Rows in the "Latest signals" card (risk signals and alert events merged). */
export const LATEST_EVENTS = 10
/** Scoring runs hourly at :15; a score older than this is shown amber. */
export const STALE_SCORE_MS = 2 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' in UTC, the calendar the daily-snapshot job (22:00 UTC) writes in. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Which tile is pressed; each one narrows the table to the banks it counts. */
export type TileFilter = 'scored' | 'elevated' | 'signals24h' | 'trade'

export interface WatchlistRow {
  id: string
  ticker: string | null
  name: string
  sector: string
  isActive: boolean
  /** Newest score, or null when the bank has no score in the latest window. */
  score: number | null
  computedAt: string | null
  /** Newest score minus yesterday's daily snapshot; null when either side is missing. */
  d24: number | null
  /** Newest score minus the snapshot from 7 days ago. */
  d7: number | null
  /** risk_score per daily snapshot in the window, oldest first. */
  sparkline: number[]
  signals7d: number
  signals24h: number
  /** From the newest priced daily snapshot; null when the bank has no price in the window. */
  price: number | null
  priceChangePct: number | null
  priceDate: string | null
  /** Newest active short_entry / watch signal for the bank. */
  tradeSignal: TradingSignalType | null
}

export interface RowInputs {
  institutions: readonly Institution[]
  scores?: ReadonlyMap<string, LatestScore>
  snapshots?: readonly SnapshotPoint[]
  signals?: readonly RiskSignal[]
  tradingSignals?: readonly TradingSignal[]
  /** Epoch ms for the 24 h / 7 d cut-offs. */
  now: number
}

function newestAtOrBefore(
  points: readonly SnapshotPoint[],
  date: string,
): SnapshotPoint | undefined {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].snapshot_date <= date) return points[i]
  }
  return undefined
}

function newestPriced(
  points: readonly SnapshotPoint[],
): SnapshotPoint | undefined {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].stock_price !== null) return points[i]
  }
  return undefined
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/** True for the signal types the "Active trade signals" tile counts. */
export function isOpenTradeSignal(signal: TradingSignal): boolean {
  return signal.is_active && signal.signal_type !== 'short_exit'
}

/**
 * One row per institution (active and inactive) from the raw query results.
 * Pure, so the hook can memoise it and tests can feed it fixtures. Any input
 * still loading is simply undefined and its cells come out null / empty.
 */
export function buildRows({
  institutions,
  scores,
  snapshots,
  signals,
  tradingSignals,
  now,
}: RowInputs): WatchlistRow[] {
  const yesterday = utcDate(now - DAY_MS)
  const weekAgo = utcDate(now - SIGNAL_WINDOW_DAYS * DAY_MS)
  const dayAgoMs = now - DAY_MS

  // Snapshots arrive ordered by date then institution; grouping keeps each series ascending.
  const series = new Map<string, SnapshotPoint[]>()
  for (const point of snapshots ?? []) {
    const list = series.get(point.institution_id)
    if (list) list.push(point)
    else series.set(point.institution_id, [point])
  }

  const signals7d = new Map<string, number>()
  const signals24h = new Map<string, number>()
  for (const signal of signals ?? []) {
    increment(signals7d, signal.institution_id)
    if (Date.parse(signal.signal_date) >= dayAgoMs)
      increment(signals24h, signal.institution_id)
  }

  // Trading signals are newest first, so the first match per bank is the current one.
  const trade = new Map<string, TradingSignalType>()
  for (const signal of tradingSignals ?? []) {
    if (!isOpenTradeSignal(signal) || trade.has(signal.institution_id)) continue
    trade.set(signal.institution_id, signal.signal_type)
  }

  return institutions.map((institution) => {
    const latest = scores?.get(institution.id)
    const score = latest?.score ?? null
    const points = series.get(institution.id) ?? []
    const base24 = newestAtOrBefore(points, yesterday)
    const base7 = newestAtOrBefore(points, weekAgo)
    const priced = newestPriced(points)
    return {
      id: institution.id,
      ticker: institution.ticker,
      name: institution.name,
      sector: institution.sector,
      isActive: institution.is_active,
      score,
      computedAt: latest?.computed_at ?? null,
      d24: scoreDelta(score, base24?.risk_score),
      d7: scoreDelta(score, base7?.risk_score),
      sparkline: points.map((point) => point.risk_score),
      signals7d: signals7d.get(institution.id) ?? 0,
      signals24h: signals24h.get(institution.id) ?? 0,
      price: priced?.stock_price ?? null,
      priceChangePct: priced?.stock_change_pct ?? null,
      priceDate: priced?.snapshot_date ?? null,
      tradeSignal: trade.get(institution.id) ?? null,
    }
  })
}

export interface TileCounts {
  /** Active banks with a non-null score. */
  scored: number
  /** Active banks. */
  total: number
  /** Active banks at or above WATCH. */
  elevated: number
  /** risk_signals dated in the last 24 h (all banks). */
  signals24h: number
  /** Active trading_signals of type short_entry or watch. */
  tradeSignals: number
}

export function countTiles(
  activeRows: readonly WatchlistRow[],
  signals: readonly RiskSignal[] | undefined,
  tradingSignals: readonly TradingSignal[] | undefined,
  now: number,
): TileCounts {
  const dayAgoMs = now - DAY_MS
  let scored = 0
  let elevated = 0
  for (const row of activeRows) {
    if (row.score !== null) scored++
    if (isElevated(row.score)) elevated++
  }
  let signals24h = 0
  for (const signal of signals ?? [])
    if (Date.parse(signal.signal_date) >= dayAgoMs) signals24h++
  let tradeSignals = 0
  for (const signal of tradingSignals ?? [])
    if (isOpenTradeSignal(signal)) tradeSignals++
  return {
    scored,
    total: activeRows.length,
    elevated,
    signals24h,
    tradeSignals,
  }
}

/** Does a row satisfy the pressed tile? */
export function matchesTile(
  row: WatchlistRow,
  tile: TileFilter | null,
): boolean {
  switch (tile) {
    case null:
      return true
    case 'scored':
      return row.score !== null
    case 'elevated':
      return isElevated(row.score)
    case 'signals24h':
      return row.signals24h > 0
    case 'trade':
      return row.tradeSignal !== null
  }
}

/** Rows in the Movers card. */
export const MOVERS_LIMIT = 5

/**
 * The `limit` banks whose score moved most since yesterday's snapshot, either
 * direction, largest absolute move first; ties go to the higher score, then
 * name. Banks without a delta (no score or no snapshot) are left out.
 */
export function topMovers(
  rows: readonly WatchlistRow[],
  limit = MOVERS_LIMIT,
): WatchlistRow[] {
  return rows
    .filter(hasMove)
    .sort(
      (a, b) =>
        Math.abs(b.d24) - Math.abs(a.d24) ||
        b.score - a.score ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

type Mover = WatchlistRow & { d24: number; score: number }

/** A delta exists only when the current score does (scoreDelta), so both narrow together. */
function hasMove(row: WatchlistRow): row is Mover {
  return row.d24 !== null && row.score !== null
}

/** 'investment_bank' -> 'Investment bank'. */
export function sectorLabel(sector: string): string {
  const words = sector.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Case-insensitive ticker-or-name match. An empty query matches everything. */
export function matchesSearch(row: WatchlistRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    (row.ticker?.toLowerCase().includes(needle) ?? false) ||
    row.name.toLowerCase().includes(needle)
  )
}

export type WatchlistEvent =
  | {
      kind: 'signal'
      id: string
      institutionId: string
      /** ISO timestamp the event is ordered by. */
      at: string
      signal: RiskSignal
    }
  | {
      kind: 'alert'
      id: string
      institutionId: string
      at: string
      alert: AlertHistory
    }

/** Newest `limit` events from risk signals and alert history, merged by time. */
export function mergeEvents(
  signals: readonly RiskSignal[] | undefined,
  history: readonly AlertHistory[] | undefined,
  limit = LATEST_EVENTS,
): WatchlistEvent[] {
  const events: WatchlistEvent[] = []
  for (const signal of signals ?? [])
    events.push({
      kind: 'signal',
      id: `signal:${signal.id}`,
      institutionId: signal.institution_id,
      at: signal.signal_date,
      signal,
    })
  for (const alert of history ?? [])
    events.push({
      kind: 'alert',
      id: `alert:${alert.id}`,
      institutionId: alert.institution_id,
      at: alert.created_at,
      alert,
    })
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return events.slice(0, limit)
}

/** Status of a secondary query, enough for a cell skeleton or an inline error with Retry. */
export interface SecondaryStatus {
  isPending: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

function statusOf(query: UseQueryResult<unknown, Error>): SecondaryStatus {
  return {
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
  }
}

/** Epoch ms that ticks every `intervalMs`, so relative times and staleness stay current. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Everything the Watchlist renders, composed from the shared query hooks.
 * Only the institutions query gates the page; each other query reports its
 * own status so cells can show skeletons and cards can show inline errors.
 */
export function useWatchlistData() {
  const now = useNow()
  const [since] = useState(() =>
    format(subDays(new Date(), SPARKLINE_DAYS), 'yyyy-MM-dd'),
  )

  const institutions = useInstitutions()
  const scores = useLatestScores()
  const snapshots = useSnapshots(since)
  const recentSignals = useRecentSignals(SIGNAL_WINDOW_DAYS)
  const latestSignals = useLatestSignals(LATEST_EVENTS)
  const trading = useTradingSignals()
  const history = useAlertHistory(LATEST_EVENTS)

  const index = useMemo(() => {
    const map = new Map<string, Institution>()
    for (const institution of institutions.data ?? [])
      map.set(institution.id, institution)
    return map
  }, [institutions.data])

  const rows = useMemo(
    () =>
      buildRows({
        institutions: institutions.data ?? [],
        scores: scores.data?.scores,
        snapshots: snapshots.data,
        signals: recentSignals.data,
        tradingSignals: trading.data,
        now,
      }),
    [
      institutions.data,
      scores.data,
      snapshots.data,
      recentSignals.data,
      trading.data,
      now,
    ],
  )

  const activeRows = useMemo(() => rows.filter((row) => row.isActive), [rows])

  const tiles = useMemo(
    () => countTiles(activeRows, recentSignals.data, trading.data, now),
    [activeRows, recentSignals.data, trading.data, now],
  )

  const events = useMemo(
    () => mergeEvents(latestSignals.data, history.data),
    [latestSignals.data, history.data],
  )

  return {
    now,
    since,
    institutions,
    index,
    rows,
    activeRows,
    tiles,
    events,
    lastComputedAt: scores.data?.lastComputedAt ?? null,
    status: {
      scores: statusOf(scores),
      snapshots: statusOf(snapshots),
      signals: statusOf(recentSignals),
      trading: statusOf(trading),
      latestSignals: statusOf(latestSignals),
      history: statusOf(history),
    },
  }
}

export type WatchlistData = ReturnType<typeof useWatchlistData>
