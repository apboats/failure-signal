import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import {
  listForInstitution,
  listLatest,
  listRecent,
  type SignalListOptions,
} from '@/api/signals'
import { queryKeys } from '@/queries/keys'

/**
 * One page of a bank's signals with the exact total. Keeps the previous page on
 * screen while a filter/offset change loads, so the list does not flash empty.
 */
export function useSignals(
  institutionId: string | undefined,
  opts: SignalListOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.signals(institutionId ?? '', opts),
    queryFn: institutionId
      ? () => listForInstitution(institutionId, opts)
      : skipToken,
    placeholderData: keepPreviousData,
  })
}

/** Signals dated in the last `days` days across all banks (Watchlist "Signals 7d" / 24h tiles). */
export function useRecentSignals(days = 7) {
  return useQuery({
    queryKey: queryKeys.recentSignals(days),
    queryFn: () => listRecent({ sinceDays: days }),
  })
}

/** The newest `limit` signals across all banks. */
export function useLatestSignals(limit = 10) {
  return useQuery({
    queryKey: queryKeys.latestSignals(limit),
    queryFn: () => listLatest(limit),
  })
}
