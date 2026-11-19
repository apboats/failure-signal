/**
 * Pure helpers for the Institution Detail hero and score-history chart.
 * No React and no Supabase, so history.test.ts covers them directly.
 */
import { scoreDelta } from '@/domain/risk'
import { formatCount, formatDate } from '@/lib/format'
import type { ScoreHistoryPoint } from '@shared/types'

/** The newest hourly score for a bank; both fields null when it has never been scored. */
export interface LatestPoint {
  score: number | null
  computedAt: string | null
}

/**
 * 'YYYY-MM-DD' of a timestamp in UTC. daily-snapshot dates its rows with
 * `new Date().toISOString().split('T')[0]` at 22:00 UTC, so the hourly score
 * has to be placed on the same UTC calendar to line up with the snapshots.
 */
export function utcDate(iso: string): string | null {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10)
}

/**
 * Daily points (ascending) plus the newest hourly score as the final point.
 * Snapshots land at 22:00 UTC, so for most of the day the chart would
 * otherwise end yesterday while the hero shows today's score. A score dated
 * the same UTC day as the last snapshot replaces that point (it is newer);
 * a score older than the last snapshot leaves the series untouched.
 */
export function withLatestPoint(
  points: readonly ScoreHistoryPoint[],
  latest: LatestPoint | null | undefined,
): ScoreHistoryPoint[] {
  if (!latest || latest.score === null || latest.computedAt === null)
    return [...points]
  const date = utcDate(latest.computedAt)
  if (!date) return [...points]
  const point: ScoreHistoryPoint = { date, score: latest.score }
  const last = points.at(-1)
  if (!last || date > last.date) return [...points, point]
  if (date === last.date) return [...points.slice(0, -1), point]
  return [...points]
}

/** Score of the newest point dated strictly before `date` ('YYYY-MM-DD'), or null. */
export function scoreBefore(
  points: readonly ScoreHistoryPoint[],
  date: string,
): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]
    if (point.date < date) return point.score
  }
  return null
}

/**
 * Δ24h: the latest score minus the newest daily snapshot before the latest
 * score's UTC day. Null when the bank has no score or no earlier snapshot.
 */
export function delta24h(
  points: readonly ScoreHistoryPoint[],
  latest: LatestPoint | null | undefined,
): number | null {
  if (!latest || latest.score === null || latest.computedAt === null)
    return null
  const date = utcDate(latest.computedAt)
  return date ? scoreDelta(latest.score, scoreBefore(points, date)) : null
}

/** Scoring runs hourly; a score older than this is shown as stale. */
export const STALE_SCORE_MS = 2 * 60 * 60 * 1000

/** True when `computedAt` is more than STALE_SCORE_MS before `now`. */
export function isStaleScore(
  computedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!computedAt) return false
  const ms = Date.parse(computedAt)
  return !Number.isNaN(ms) && now - ms > STALE_SCORE_MS
}

/** The measured window under the chart: "31 points · Oct 19 – Nov 18, 2026". */
export function describeWindow(points: readonly ScoreHistoryPoint[]): string {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return 'No points'
  const sameYear = first.date.slice(0, 4) === last.date.slice(0, 4)
  const from = formatDate(first.date, sameYear ? 'MMM d' : 'MMM d, yyyy')
  return `${formatCount(points.length)} points · ${from} – ${formatDate(last.date)}`
}
