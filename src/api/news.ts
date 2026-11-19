import { isRangeNotSatisfiable, QueryError } from '@/lib/fetchAll'
import { supabase } from '@/lib/supabase'
import type { NewsArticle } from '@shared/types'

export interface NewsListOptions {
  offset?: number
  limit?: number
}

export interface NewsPage {
  rows: NewsArticle[]
  /** True total for the bank (count: 'exact'), not the page size. */
  total: number
}

export const NEWS_PAGE_SIZE = 30

/**
 * One page of a bank's articles, newest published first (unknown dates last).
 * An offset past the last row returns an empty page with the real total.
 */
export async function listForInstitution(
  institutionId: string,
  { offset = 0, limit = NEWS_PAGE_SIZE }: NewsListOptions = {},
): Promise<NewsPage> {
  const build = (head: boolean) =>
    supabase
      .from('news_articles')
      .select('*', { count: 'exact', head })
      .eq('institution_id', institutionId)

  const res = await build(false)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (res.error) {
    if (!isRangeNotSatisfiable(res.error, res.status))
      throw new QueryError(res.error, res.status)
    const head = await build(true)
    if (head.error) throw new QueryError(head.error, head.status)
    return { rows: [], total: head.count ?? 0 }
  }
  return { rows: res.data, total: res.count ?? res.data.length }
}
