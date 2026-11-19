import { format, subDays } from 'date-fns'
import { QueryError } from '@/lib/fetchAll'
import { supabase, unwrap } from '@/lib/supabase'
import type { LatestScore, ScoreHistoryPoint } from '@shared/types'

export interface LatestScores {
  /** institution_id -> newest score. A bank missing from the map has no recent score. */
  scores: Map<string, LatestScore>
  /** Newest computed_at across all banks, i.e. when the scoring job last ran; null when nothing was scored. */
  lastComputedAt: string | null
  /** Which query answered: the latest_risk_scores view, or the bounded risk_scores fallback. */
  source: 'view' | 'fallback'
}

/** Window of the fallback query. Scoring runs hourly, so 12 h covers a few missed runs and stays well under 1000 rows (61 banks x 12). */
const FALLBACK_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * Set once the view is known to be absent so refetches (every 5 min) skip the
 * 404 and go straight to the fallback. Creating the view mid-session needs a reload.
 */
let viewMissing = false

function isMissingRelation(error: { code: string }, status: number): boolean {
  return error.code === 'PGRST205' || status === 404
}

function collect(
  rows: LatestScore[],
  source: LatestScores['source'],
): LatestScores {
  const scores = new Map<string, LatestScore>()
  let lastComputedAt: string | null = null
  let lastMs = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    // Fallback rows arrive newest-first; keep the first per institution. View rows are unique already.
    if (scores.has(row.institution_id)) continue
    scores.set(row.institution_id, row)
    if (row.computed_at) {
      const ms = Date.parse(row.computed_at)
      if (ms > lastMs) {
        lastMs = ms
        lastComputedAt = row.computed_at
      }
    }
  }
  return { scores, lastComputedAt, source }
}

/**
 * Newest score per institution. Reads the latest_risk_scores view when it
 * exists; until the migration is applied it falls back to the last 12 h of
 * risk_scores (newest first, bounded) deduplicated client-side.
 */
export async function getLatestScores(): Promise<LatestScores> {
  if (!viewMissing) {
    const res = await supabase
      .from('latest_risk_scores')
      .select('*')
      .limit(1000)
    if (!res.error) return collect(res.data, 'view')
    if (!isMissingRelation(res.error, res.status))
      throw new QueryError(res.error, res.status)
    viewMissing = true
  }

  const since = new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString()
  const rows = unwrap(
    await supabase
      .from('risk_scores')
      .select(
        'institution_id, score, score_components, signal_count, computed_at',
      )
      .gte('computed_at', since)
      .order('computed_at', { ascending: false })
      .order('institution_id')
      .limit(1000),
  )
  return collect(rows, 'fallback')
}

/** Rows kept per history query: 400 daily points is about 13 months, under the 1000-row cap. */
const HISTORY_MAX_ROWS = 400

/**
 * Daily score history for one bank from daily_snapshots, oldest first. Queries
 * newest-first with a limit so the result always ends at the latest snapshot
 * (the old risk_scores query returned the oldest 90 rows ever written).
 * `days: 'all'` returns the newest HISTORY_MAX_ROWS days.
 */
export async function getScoreHistoryDaily(
  institutionId: string,
  days: number | 'all' = 90,
): Promise<ScoreHistoryPoint[]> {
  let query = supabase
    .from('daily_snapshots')
    .select('snapshot_date, risk_score')
    .eq('institution_id', institutionId)
  if (days !== 'all')
    query = query.gte(
      'snapshot_date',
      format(subDays(new Date(), days), 'yyyy-MM-dd'),
    )
  const rows = unwrap(
    await query
      .order('snapshot_date', { ascending: false })
      .limit(HISTORY_MAX_ROWS),
  )
  return rows
    .reverse()
    .map((row) => ({ date: row.snapshot_date, score: row.risk_score }))
}
