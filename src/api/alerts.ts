import { QueryError } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { AlertConfig, AlertHistory, SignalCategory } from '@shared/types'

export interface NewAlertConfig {
  institution_id: string
  threshold_score: number
  /** null = any category. */
  signal_categories?: SignalCategory[] | null
  notify_email?: boolean
  notify_in_app?: boolean
  is_active?: boolean
}

export type AlertConfigPatch = Partial<
  Pick<
    AlertConfig,
    | 'threshold_score'
    | 'signal_categories'
    | 'notify_email'
    | 'notify_in_app'
    | 'is_active'
  >
>

export interface WriteResult {
  error: QueryError | null
}

/** Alert configs, newest first. */
export async function listConfigs(): Promise<AlertConfig[]> {
  return unwrap(
    await supabase
      .from('alert_configs')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1000),
  )
}

export async function insert(values: NewAlertConfig): Promise<WriteResult> {
  const res = await supabase.from('alert_configs').insert({
    institution_id: values.institution_id,
    threshold_score: values.threshold_score,
    signal_categories: values.signal_categories ?? null,
    notify_email: values.notify_email ?? false,
    notify_in_app: values.notify_in_app ?? true,
    is_active: values.is_active ?? true,
  })
  return { error: res.error ? new QueryError(res.error, res.status) : null }
}

/** Patch one config (pause/resume, threshold, categories). Reports a no-row update as an error. */
export async function update(
  id: string,
  patch: AlertConfigPatch,
): Promise<WriteResult> {
  const res = await supabase
    .from('alert_configs')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (res.error) return { error: new QueryError(res.error, res.status) }
  if (res.data.length === 0) {
    return {
      error: new QueryError(
        { message: 'Alert not found', code: 'NOT_FOUND' },
        res.status,
      ),
    }
  }
  return { error: null }
}

export async function remove(id: string): Promise<WriteResult> {
  const res = await supabase.from('alert_configs').delete().eq('id', id)
  return { error: res.error ? new QueryError(res.error, res.status) : null }
}

/** Triggered alerts, newest first. */
export async function listHistory(limit = 50): Promise<AlertHistory[]> {
  return unwrap(
    await supabase
      .from('alert_history')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .limit(limit),
  )
}
