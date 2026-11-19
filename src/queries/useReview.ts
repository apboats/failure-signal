import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  countMentions,
  listCandidates,
  reviewInstitution,
} from '@/api/institutions'
import type { ReviewDecision } from '@/lib/database.types'
import { queryKeys } from '@/queries/keys'

/** Institutions the news pipeline discovered, newest first. */
export function useCandidates() {
  return useQuery({
    queryKey: queryKeys.candidates,
    queryFn: listCandidates,
  })
}

/** Exact news/signal counts for the given ids. */
export function useMentionCounts(ids: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.mentions(ids),
    queryFn: () => countMentions(ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
  })
}

/**
 * Track / ignore / send back to pending. Refreshes every institutions query
 * (the key family covers the candidate list and the Watchlist's index) and
 * the latest scores, since tracking a bank adds it to scoring.
 */
export function useReviewInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: ReviewDecision }) =>
      reviewInstitution(id, decision),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.institutions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.latestScores }),
      ]),
  })
}
