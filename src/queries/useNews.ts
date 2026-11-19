import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import { listForInstitution, type NewsListOptions } from '@/api/news'
import { queryKeys } from '@/queries/keys'

/** One page of a bank's news with the exact total; previous page stays visible while paging. */
export function useNews(
  institutionId: string | undefined,
  opts: NewsListOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.news(institutionId ?? '', opts),
    queryFn: institutionId
      ? () => listForInstitution(institutionId, opts)
      : skipToken,
    placeholderData: keepPreviousData,
  })
}
