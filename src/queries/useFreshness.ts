import { useQuery } from '@tanstack/react-query'
import { getFreshness } from '@/api/freshness'
import { queryKeys } from '@/queries/keys'

/** Pipeline freshness (scores / prices / signals), re-probed every 60 s. */
export function useFreshness() {
  return useQuery({
    queryKey: queryKeys.freshness,
    queryFn: getFreshness,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
