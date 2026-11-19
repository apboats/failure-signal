import { fetchAll } from '@/lib/fetchAll'
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
