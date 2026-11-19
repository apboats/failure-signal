import { skipToken, useQuery } from '@tanstack/react-query'
import { getScoreHistoryDaily } from '@/api/scores'
import { queryKeys } from '@/queries/keys'

/**
 * Daily score history for a bank, oldest first, ending at the latest snapshot.
 * Disabled (isPending, no fetch) while the id is undefined, e.g. before the route param resolves.
 */
export function useScoreHistory(
  institutionId: string | undefined,
  days: number | 'all' = 90,
) {
  return useQuery({
    queryKey: queryKeys.scoreHistory(institutionId ?? '', days),
    queryFn: institutionId
      ? () => getScoreHistoryDaily(institutionId, days)
      : skipToken,
  })
}
