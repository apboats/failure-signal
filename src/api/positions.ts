import { QueryError } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { Position, PositionDirection } from '@shared/types'

export interface NewPosition {
  institution_id: string
  direction: PositionDirection
  entry_price: number
  /** Trade date 'YYYY-MM-DD'. */
  entry_date: string
  entry_score?: number | null
  shares: number
  notes?: string | null
}

export interface ClosePosition {
  id: string
  exit_price: number
  /** Trade date 'YYYY-MM-DD'. */
  exit_date: string
  exit_score?: number | null
}

export interface WriteResult {
  error: QueryError | null
}

/** Open positions first, then newest first. */
export async function list(): Promise<Position[]> {
  return unwrap(
    await supabase
      .from('positions')
      .select('*')
      .order('is_open', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1000),
  )
}

/** Open a position. The error (RLS, bad column, network) is returned, never swallowed. */
export async function insert(values: NewPosition): Promise<WriteResult> {
  const res = await supabase.from('positions').insert({
    institution_id: values.institution_id,
    direction: values.direction,
    entry_price: values.entry_price,
    entry_date: values.entry_date,
    entry_score: values.entry_score ?? null,
    shares: values.shares,
    notes: values.notes ?? null,
    is_open: true,
  })
  return { error: res.error ? new QueryError(res.error, res.status) : null }
}

/**
 * Close a position. Selects the updated id back so an update that touched no
 * row (unknown id, or RLS silently filtering it) is reported instead of
 * succeeding quietly.
 */
export async function close(values: ClosePosition): Promise<WriteResult> {
  const res = await supabase
    .from('positions')
    .update({
      exit_price: values.exit_price,
      exit_date: values.exit_date,
      exit_score: values.exit_score ?? null,
      is_open: false,
    })
    .eq('id', values.id)
    .eq('is_open', true)
    .select('id')
  if (res.error) return { error: new QueryError(res.error, res.status) }
  if (res.data.length === 0) {
    return {
      error: new QueryError(
        { message: 'Position not found or already closed', code: 'NOT_FOUND' },
        res.status,
      ),
    }
  }
  return { error: null }
}
