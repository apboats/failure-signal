import { isRangeNotSatisfiable, QueryError } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { RiskSignal, SignalCategory, SignalSeverity } from '@shared/types'

export interface SignalListOptions {
  offset?: number
  limit?: number
  category?: SignalCategory
  severity?: SignalSeverity
}

export interface SignalPage {
  rows: RiskSignal[]
  /** True total matching the filter (count: 'exact'), not the page size. */
  total: number
}

export const SIGNAL_PAGE_SIZE = 50

/**
 * One page of a bank's signals, newest first, with the exact total for
 * "Showing N of M". An offset past the last row (a stale "Load more" after a
 * filter change) returns an empty page with the real total instead of throwing.
 */
export async function listForInstitution(
  institutionId: string,
  {
    offset = 0,
    limit = SIGNAL_PAGE_SIZE,
    category,
    severity,
  }: SignalListOptions = {},
): Promise<SignalPage> {
  const build = (head: boolean) => {
    let query = supabase
      .from('risk_signals')
      .select('*', { count: 'exact', head })
      .eq('institution_id', institutionId)
    if (category) query = query.eq('category', category)
    if (severity) query = query.eq('severity', severity)
    return query
  }

  const res = await build(false)
    .order('signal_date', { ascending: false })
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

/** Signals dated within the last `sinceDays` days across all banks (bounded; ~125 rows per 30 days live). */
export async function listRecent({
  sinceDays = 7,
}: { sinceDays?: number } = {}): Promise<RiskSignal[]> {
  const since = new Date(
    Date.now() - sinceDays * 24 * 60 * 60 * 1000,
  ).toISOString()
  return unwrap(
    await supabase
      .from('risk_signals')
      .select('*')
      .gte('signal_date', since)
      .order('signal_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000),
  )
}

/** The newest `limit` signals across all banks (Watchlist "Latest signals"). */
export async function listLatest(limit = 10): Promise<RiskSignal[]> {
  return unwrap(
    await supabase
      .from('risk_signals')
      .select('*')
      .order('signal_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}
