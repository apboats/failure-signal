import { useQuery } from '@tanstack/react-query'
import { getLatestScores } from '@/api/scores'
import { queryKeys } from '@/queries/keys'

/** Newest score per institution plus lastComputedAt. Scoring is hourly; refetches every 5 min. */
export function useLatestScores() {
  return useQuery({
    queryKey: queryKeys.latestScores,
    queryFn: getLatestScores,
    refetchInterval: 5 * 60_000,
  })
}
