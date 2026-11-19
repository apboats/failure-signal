import { useQuery, type QueryObserverResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listAll } from '@/api/institutions'
import { queryKeys } from '@/queries/keys'
import type { Institution } from '@shared/types'

/**
 * Shape returned by hooks that derive a value from another query: the React
 * Query status fields pass through untouched so pages branch error -> loading
 * -> empty exactly as with a plain useQuery.
 */
export interface DerivedQuery<T> {
  data: T
  error: Error | null
  isLoading: boolean
  isPending: boolean
  isFetching: boolean
  isError: boolean
  isSuccess: boolean
  dataUpdatedAt: number
  refetch: () => Promise<QueryObserverResult<Institution[], Error>>
}

/** All institutions (active and inactive), ordered by name. Cached 10 min across pages. */
export function useInstitutions() {
  return useQuery({
    queryKey: queryKeys.institutions,
    queryFn: listAll,
    staleTime: 10 * 60_000,
  })
}

function derive<T>(
  query: ReturnType<typeof useInstitutions>,
  data: T,
): DerivedQuery<T> {
  return {
    data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    isSuccess: query.isSuccess,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  }
}

/** id -> Institution for O(1) name/ticker lookups. Empty Map while loading. */
export function useInstitutionIndex(): DerivedQuery<Map<string, Institution>> {
  const query = useInstitutions()
  const index = useMemo(() => {
    const map = new Map<string, Institution>()
    for (const institution of query.data ?? [])
      map.set(institution.id, institution)
    return map
  }, [query.data])
  return derive(query, index)
}

/** Only is_active institutions (Watchlist grid, form selects). Empty array while loading. */
export function useActiveInstitutions(): DerivedQuery<Institution[]> {
  const query = useInstitutions()
  const active = useMemo(
    () => (query.data ?? []).filter((institution) => institution.is_active),
    [query.data],
  )
  return derive(query, active)
}
