/**
 * The Validation page's date range: stored in `?range=` so a reload and a
 * shared link keep it, turned into a `since` date for the snapshot and
 * benchmark queries, and described from the rows that actually came back.
 */
import { format, subDays } from 'date-fns'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { withTabParam } from '@/components/ui'
import type { DataWindow } from '@/domain/analytics/series'
import { formatCount, formatDate } from '@/lib/format'

export const RANGE_KEYS = ['90d', '180d', '1y', 'all'] as const
export type RangeKey = (typeof RANGE_KEYS)[number]
export const DEFAULT_RANGE: RangeKey = '180d'
export const RANGE_PARAM = 'range'

export const RANGE_OPTIONS: readonly { value: RangeKey; label: string }[] = [
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
]

const RANGE_DAYS: Record<RangeKey, number | null> = {
  '90d': 90,
  '180d': 180,
  '1y': 365,
  all: null,
}

export function isRangeKey(
  value: string | null | undefined,
): value is RangeKey {
  return (
    value !== null &&
    value !== undefined &&
    (RANGE_KEYS as readonly string[]).includes(value)
  )
}

/** 'YYYY-MM-DD' lower bound for the queries, or undefined for every row. */
export function sinceForRange(
  range: RangeKey,
  now: Date = new Date(),
): string | undefined {
  const days = RANGE_DAYS[range]
  return days === null ? undefined : format(subDays(now, days), 'yyyy-MM-dd')
}

/** Current range from `?range=` (DEFAULT_RANGE when absent or unknown) and a setter that keeps every other param. */
export function useRangeParam(): [RangeKey, (next: RangeKey) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(RANGE_PARAM)
  const value = isRangeKey(raw) ? raw : DEFAULT_RANGE
  const setValue = useCallback(
    (next: RangeKey) => {
      setSearchParams((prev) => withTabParam(prev, RANGE_PARAM, next), {
        replace: true,
      })
    },
    [setSearchParams],
  )
  return [value, setValue]
}

/** 'n snapshots · from – to · m banks (k inactive excluded)', computed from the fetched rows. */
export function describeDataWindow(dataWindow: DataWindow): string {
  if (dataWindow.rows.length === 0 || !dataWindow.from || !dataWindow.to)
    return 'No priced snapshots in this range'
  const sameYear = dataWindow.from.slice(0, 4) === dataWindow.to.slice(0, 4)
  const from = formatDate(dataWindow.from, sameYear ? 'MMM d' : 'MMM d, yyyy')
  const to = formatDate(dataWindow.to, 'MMM d, yyyy')
  const banks = `${formatCount(dataWindow.banks)} ${dataWindow.banks === 1 ? 'bank' : 'banks'}`
  const excluded =
    dataWindow.excludedInactiveBanks > 0
      ? ` (${formatCount(dataWindow.excludedInactiveBanks)} inactive excluded)`
      : ''
  return `${formatCount(dataWindow.rows.length)} snapshots · ${from} – ${to} · ${banks}${excluded}`
}
