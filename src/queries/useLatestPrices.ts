import { useQuery } from '@tanstack/react-query'
import { getLatestPrices } from '@/api/snapshots'
import { queryKeys } from '@/queries/keys'

/**
 * Newest priced snapshot per institution for the given ids (open positions,
 * trading signals). An empty id list resolves to an empty Map without a request.
 */
export function useLatestPrices(institutionIds: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.latestPrices(institutionIds),
    queryFn: () => getLatestPrices(institutionIds),
  })
}
