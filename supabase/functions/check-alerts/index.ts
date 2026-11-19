/**
 * check-alerts: hourly, after compute-risk-score. Compares each active
 * alert_configs row with its bank's latest score and writes one alert_history
 * row when the threshold is met, at most once per config per 24 h.
 *
 * Delivery is in-app only: alert_history is what the Alerts page lists.
 * `notify_email` is not implemented and is ignored here.
 *
 * Reads are bounded: one risk_scores read for the latest score of every bank
 * and one alert_history read for the dedupe window, then Map/Set lookups,
 * instead of two queries per config.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { requireEnv } from '../_shared/env.ts'

const HOUR_MS = 60 * 60 * 1000
/**
 * Latest scores come from one bounded read over this window (61 banks x 24
 * hourly rows is 1,464, so the newest 1,000 still hold every bank scored in
 * the last ~16 h). A bank with no row in the window is not alerted on.
 */
const LATEST_SCORE_WINDOW_MS = 24 * HOUR_MS
/** A config fires at most once inside this window. */
const DEDUPE_WINDOW_MS = 24 * HOUR_MS
/** PostgREST max_rows on the live project. */
const ROW_CAP = 1000

interface AlertConfigRow {
  id: string
  institution_id: string | null
  threshold_score: number | string
  institutions: { name: string } | null
}

interface LatestScoreRow {
  institution_id: string
  score: number | string
  score_components: Record<string, unknown> | null
  computed_at: string
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )
    const now = Date.now()

    const { data: configRows, error: configError } = await supabase
      .from('alert_configs')
      .select('id, institution_id, threshold_score, institutions(name)')
      .eq('is_active', true)
      .order('id')
      .limit(ROW_CAP)
    if (configError) throw configError
    const configs = (configRows ?? []) as unknown as AlertConfigRow[]
    if (configs.length === 0) return json({ success: true, triggered: [] })

    // Latest score per bank: one bounded read, newest first.
    const { data: scoreRows, error: scoreError } = await supabase
      .from('risk_scores')
      .select('institution_id, score, score_components, computed_at')
      .gte('computed_at', new Date(now - LATEST_SCORE_WINDOW_MS).toISOString())
      .order('computed_at', { ascending: false })
      .limit(ROW_CAP)
    if (scoreError) throw scoreError
    const latestScores = new Map<string, LatestScoreRow>()
    for (const row of (scoreRows ?? []) as LatestScoreRow[]) {
      if (!latestScores.has(row.institution_id)) {
        latestScores.set(row.institution_id, row)
      }
    }

    // Configs that already fired inside the dedupe window.
    const { data: recentRows, error: recentError } = await supabase
      .from('alert_history')
      .select('alert_config_id')
      .gte('created_at', new Date(now - DEDUPE_WINDOW_MS).toISOString())
      .limit(ROW_CAP)
    if (recentError) throw recentError
    const recentlyFired = new Set<string>()
    for (const row of (recentRows ?? []) as Array<{
      alert_config_id: string | null
    }>) {
      if (row.alert_config_id) recentlyFired.add(row.alert_config_id)
    }

    const triggered: Array<{
      config_id: string
      institution: string
      score: number
      reason: string
    }> = []

    for (const config of configs) {
      if (!config.institution_id) continue
      const latest = latestScores.get(config.institution_id)
      if (!latest) continue

      const currentScore = Number(latest.score)
      const threshold = Number(config.threshold_score)
      if (!(currentScore >= threshold)) continue
      if (recentlyFired.has(config.id)) continue

      const components = latest.score_components ?? {}
      const topSignals = Object.entries(components)
        .filter(
          (pair): pair is [string, number] =>
            !pair[0].startsWith('_') &&
            typeof pair[1] === 'number' &&
            pair[1] > 0,
        )
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([category]) => category.replace(/_/g, ' '))

      const institution = config.institutions?.name ?? config.institution_id
      const reason =
        `${institution} risk score reached ${currentScore.toFixed(1)} (threshold ${threshold.toFixed(1)}).` +
        (topSignals.length > 0 ? ` Top signals: ${topSignals.join(', ')}.` : '')

      const { error: insertError } = await supabase
        .from('alert_history')
        .insert({
          alert_config_id: config.id,
          institution_id: config.institution_id,
          triggered_score: currentScore,
          trigger_reason: reason,
        })
      if (insertError) {
        console.error(
          `alert_history insert failed for config ${config.id} (${institution}): ${insertError.message}`,
        )
        continue
      }

      recentlyFired.add(config.id)
      triggered.push({
        config_id: config.id,
        institution,
        score: currentScore,
        reason,
      })
    }

    return json({ success: true, triggered })
  } catch (error) {
    console.error('check-alerts failed:', error)
    return json({ error: String(error) }, 500)
  }
})
