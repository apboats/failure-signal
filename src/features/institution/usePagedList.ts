import {
  keepPreviousData,
  useInfiniteQuery,
  type QueryKey,
} from '@tanstack/react-query'
import { useMemo } from 'react'

/** One page of a counted PostgREST list: the rows plus the exact total. */
export interface ListPage<T> {
  rows: T[]
  total: number
}

export interface PagedListOptions<T> {
  /** Distinct from the single-page key of the same list (see src/queries/keys.ts). */
  queryKey: QueryKey
  pageSize: number
  fetchPage: (offset: number) => Promise<ListPage<T>>
}

export interface PagedList<T> {
  /** Every row loaded so far, in order. */
  rows: T[]
  /** Exact total for the current filter; null until the first page arrives. */
  total: number | null
  isPending: boolean
  isError: boolean
  error: Error | null
  /** Showing the previous filter's rows while the new first page loads. */
  isPlaceholderData: boolean
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
  refetch: () => void
}

/**
 * "Load more" over a page API that returns `{ rows, total }` for an offset.
 * Pages are fetched by offset and concatenated. The previous list stays on
 * screen while a filter change loads its first page, so the card never
 * flashes empty; Load more is held off until the real page is in.
 */
export function usePagedList<T>({
  queryKey,
  pageSize,
  fetchPage,
}: PagedListOptions<T>): PagedList<T> {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, page) => n + page.rows.length, 0)
      const exhausted =
        lastPage.rows.length < pageSize || loaded >= lastPage.total
      return exhausted ? undefined : loaded
    },
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.rows) ?? [],
    [data],
  )
  const total = data?.pages.at(-1)?.total ?? null
  return {
    rows,
    total,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    isPlaceholderData: query.isPlaceholderData,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (!query.isPlaceholderData && !query.isFetchingNextPage)
        void query.fetchNextPage()
    },
    refetch: () => {
      void query.refetch()
    },
  }
}
