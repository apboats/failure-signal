import { useQuery } from '@tanstack/react-query'
import { getById } from '@/api/institutions'
import { queryKeys } from '@/queries/keys'

/**
 * One institution by id. `data` is null (not an error) when the id does not
 * exist, which the page renders as its not-found state. The key sits under the
 * institutions family so an invalidation of the list sweeps it too.
 */
export function useInstitution(id: string) {
  return useQuery({
    queryKey: [...queryKeys.institutions, 'byId', id] as const,
    queryFn: () => getById(id),
    staleTime: 10 * 60_000,
  })
}
