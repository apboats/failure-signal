/**
 * Pipeline freshness thresholds (design brief §10a, finding F037). Pure so the
 * pill and the tests share one definition. Cadence from supabase/cron_fix.sql:
 * scores hourly at :15 UTC, prices daily at 22:00 UTC, signals hourly.
 */

/** 'ok' is on time, 'late' amber, 'stale' red, 'info' uncoloured, 'missing' no data. */
export type FreshnessTone = 'ok' | 'late' | 'stale' | 'info' | 'missing'

export const SCORES_LATE_MS = 2 * 60 * 60 * 1000
export const SCORES_STALE_MS = 6 * 60 * 60 * 1000
/** Prices are amber when more than this many business days behind today. */
export const PRICES_LATE_BUSINESS_DAYS = 1
export const PRICES_STALE_BUSINESS_DAYS = 3

export const CRON_CADENCE =
  'Expected cadence: scores hourly at :15 UTC, prices daily at 22:00 UTC, signals hourly (zero new signals in a quiet hour is normal)'

const DAY_MS = 24 * 60 * 60 * 1000

function utcMidnight(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function parseUtcDate(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isFinite(ms) ? ms : null
}

/**
 * Weekdays (Mon–Fri, UTC) strictly after `dateISO` up to and including today.
 * A Friday snapshot read on Monday is 1 business day behind; on Tuesday, 2.
 * Capped at 366 so a years-old date cannot loop for long.
 */
export function businessDaysBehind(dateISO: string, now: number): number {
  const from = parseUtcDate(dateISO)
  if (from === null) return 0
  const today = utcMidnight(now)
  let count = 0
  for (
    let ms = from + DAY_MS, i = 0;
    ms <= today && i < 366;
    ms += DAY_MS, i++
  ) {
    const day = new Date(ms).getUTCDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

/** Hourly scoring: amber past 2 h, red past 6 h. */
export function scoresTone(
  scoresAt: string | null,
  now: number,
): FreshnessTone {
  if (!scoresAt) return 'missing'
  const age = now - Date.parse(scoresAt)
  if (!Number.isFinite(age)) return 'missing'
  if (age > SCORES_STALE_MS) return 'stale'
  if (age > SCORES_LATE_MS) return 'late'
  return 'ok'
}

/** Daily prices, weekend-aware: amber past 1 business day behind, red past 3. */
export function pricesTone(
  pricesDate: string | null,
  now: number,
): FreshnessTone {
  if (!pricesDate) return 'missing'
  const behind = businessDaysBehind(pricesDate, now)
  if (behind > PRICES_STALE_BUSINESS_DAYS) return 'stale'
  if (behind > PRICES_LATE_BUSINESS_DAYS) return 'late'
  return 'ok'
}

/** Signals are informational: a quiet hour legitimately produces none. */
export function signalsTone(signalsAt: string | null): FreshnessTone {
  return signalsAt ? 'info' : 'missing'
}

/** Same UTC calendar day as `now`, so a timestamp can drop its date part. */
export function isSameUtcDay(iso: string, now: number): boolean {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return false
  return utcMidnight(ms) === utcMidnight(now)
}
