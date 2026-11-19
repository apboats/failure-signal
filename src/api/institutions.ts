import type { ReviewDecision } from '@/lib/database.types'
import { fetchAll, QueryError } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { Institution } from '@shared/types'

/**
 * Every institution, active or not, ordered by name. Pages that need the active
 * set filter client-side; history views (positions, alerts, backtests) need the
 * inactive ones to resolve names instead of showing "Unknown".
 */
export async function listAll(): Promise<Institution[]> {
  return fetchAll(() =>
    supabase.from('institutions').select('*').order('name').order('id'),
  )
}

/** One institution, or null when the id does not exist (not-found state, not an error). */
export async function getById(id: string): Promise<Institution | null> {
  return unwrap(
    await supabase.from('institutions').select('*').eq('id', id).maybeSingle(),
  )
}

/**
 * Institutions the news pipeline discovered (migration 00006), newest first.
 * The Review page splits them by review_status.
 */
export async function listCandidates(): Promise<Institution[]> {
  return unwrap(
    await supabase
      .from('institutions')
      .select('*')
      .not('discovered_at', 'is', null)
      .order('discovered_at', { ascending: false })
      .order('id')
      .limit(1000),
  )
}

/**
 * Track, ignore, or send back to pending a discovered institution. Goes through
 * the review_institution function, which only touches discovered rows.
 */
export async function reviewInstitution(
  id: string,
  decision: ReviewDecision,
): Promise<void> {
  const { error, status } = await supabase.rpc('review_institution', {
    p_id: id,
    p_decision: decision,
  })
  if (error) throw new QueryError(error, status)
}

export interface MentionCounts {
  news: number
  signals: number
}

/**
 * Exact news-article and risk-signal counts per id (head-only count queries,
 * so no row cap applies). The review queue is small, so two requests per row
 * is fine.
 */
export async function countMentions(
  ids: readonly string[],
): Promise<Map<string, MentionCounts>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const [news, signals] = await Promise.all([
        supabase
          .from('news_articles')
          .select('id', { count: 'exact', head: true })
          .eq('institution_id', id),
        supabase
          .from('risk_signals')
          .select('id', { count: 'exact', head: true })
          .eq('institution_id', id),
      ])
      if (news.error) throw new QueryError(news.error, news.status)
      if (signals.error) throw new QueryError(signals.error, signals.status)
      return [
        id,
        { news: news.count ?? 0, signals: signals.count ?? 0 },
      ] as const
    }),
  )
  return new Map(entries)
}
