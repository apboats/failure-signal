/**
 * compute-risk-score: hourly. One risk_scores row per active bank, keyed on
 * (institution_id, computed_at) with computed_at floored to the hour so a
 * rerun inside the same hour overwrites instead of appending.
 *
 * Formula:
 *   raw = min(100, sum over categories of
 *             weight[category] x min(100, sum over signals of
 *               SEVERITY_VALUES[severity] x exp(-DECAY_LAMBDA x days_ago)))
 * over the last 30 days of risk_signals, and the stored score is the display
 * scale toDisplayScore(raw) = 100 x (1 - exp(-raw / SCORE_SCALE)) from
 * ../_shared/thresholds.ts (raw is kept in score_components._raw). `days_ago`
 * is measured from the run's floored hour so the stored row is as-of its own
 * computed_at.
 *
 * Reads are bounded and batched: one risk_scores read for previous scores,
 * one risk_signals read for the 30-day window, one upsert for every row.
 * Peer contagion (a >CONTAGION_DELTA point one-run jump on the display scale raises a medium/high
 * peer_contagion signal for same-sector banks, at most one per bank per day)
 * is decided from the same in-memory signal set and inserted in one call.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { requireEnv } from '../_shared/env.ts'
import { toDisplayScore } from '../_shared/thresholds.ts'

const DECAY_LAMBDA = 0.1

const SEVERITY_VALUES: Record<string, number> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 100,
}

/** Applied, with a warning, to a category that has no global scoring_weights row. */
const DEFAULT_WEIGHT = 0.05
const SIGNAL_WINDOW_DAYS = 30
/** A one-run jump above this many display-scale points raises peer_contagion for the sector. */
const CONTAGION_DELTA = 30
const CONTAGION_HIGH_DELTA = 50

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** Previous score lookback: the last run is one hour back; 3 h covers a missed run. */
const PREV_SCORE_WINDOW_MS = 3 * HOUR_MS
/** PostgREST max_rows on the live project. */
const ROW_CAP = 1000
/** Asked for, but PostgREST still caps at max_rows; a full page is logged. */
const SIGNAL_ROW_LIMIT = 5000

interface InstitutionRow {
  id: string
  name: string
  sector: string | null
}

interface SignalRow {
  institution_id: string
  category: string
  severity: string
  signal_date: string
}

interface PrevScoreRow {
  institution_id: string
  score: number | string
  computed_at: string
}

interface ScoredInstitution {
  institution_id: string
  name: string
  sector: string | null
  /** Display score (0-100) stored in risk_scores.score. */
  score: number
  /** Raw weighted composite before the display transform. */
  rawScore: number
  components: Record<string, number>
  weightsUsed: Record<string, number>
  signalCount: number
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const body = await req.json().catch(() => ({}))
    const onlyInstitution: string | null =
      body && typeof body.institution_id === 'string'
        ? body.institution_id
        : null

    // Every row of this run shares one computed_at, floored to the hour.
    const runAt = new Date()
    runAt.setUTCMinutes(0, 0, 0)
    const runAtIso = runAt.toISOString()
    const runAtMs = runAt.getTime()

    // Banks to score (sector drives peer contagion).
    let institutionQuery = supabase
      .from('institutions')
      .select('id, name, sector')
      .eq('is_active', true)
      .order('id')
      .limit(ROW_CAP)
    if (onlyInstitution) {
      institutionQuery = institutionQuery.eq('id', onlyInstitution)
    }
    const { data: institutionRows, error: instError } = await institutionQuery
    if (instError) throw instError
    const institutions = (institutionRows ?? []) as InstitutionRow[]

    // Global scoring weights: fail loudly rather than score everything at the default.
    const { data: weightRows, error: weightError } = await supabase
      .from('scoring_weights')
      .select('category, weight')
      .is('institution_id', null)
      .limit(ROW_CAP)
    if (weightError) throw weightError
    if (!weightRows || weightRows.length === 0) {
      throw new Error(
        'scoring_weights has no global rows (institution_id is null); refusing to score with defaults',
      )
    }
    const weightMap: Record<string, number> = {}
    for (const row of weightRows as Array<{
      category: string
      weight: number | string
    }>) {
      weightMap[row.category] = Number(row.weight)
    }
    console.log(
      `[compute-risk-score] global weights: ${JSON.stringify(weightMap)}`,
    )
    const warnedCategories = new Set<string>()
    const weightFor = (category: string): number => {
      const weight = weightMap[category]
      if (weight !== undefined) return weight
      if (!warnedCategories.has(category)) {
        warnedCategories.add(category)
        console.warn(
          `[compute-risk-score] no global weight for category '${category}'; using ${DEFAULT_WEIGHT}`,
        )
      }
      return DEFAULT_WEIGHT
    }

    // Previous score per bank: one bounded read, newest first, strictly before this run.
    const { data: prevRows, error: prevError } = await supabase
      .from('risk_scores')
      .select('institution_id, score, computed_at')
      .gte(
        'computed_at',
        new Date(runAtMs - PREV_SCORE_WINDOW_MS).toISOString(),
      )
      .lt('computed_at', runAtIso)
      .order('computed_at', { ascending: false })
      .limit(ROW_CAP)
    if (prevError) throw prevError
    const prevScores = new Map<string, number>()
    for (const row of (prevRows ?? []) as PrevScoreRow[]) {
      if (!prevScores.has(row.institution_id)) {
        prevScores.set(row.institution_id, Number(row.score))
      }
    }

    // The 30-day signal window for every bank in one read, grouped in memory.
    const windowStartIso = new Date(
      runAtMs - SIGNAL_WINDOW_DAYS * DAY_MS,
    ).toISOString()
    const { data: signalRows, error: signalError } = await supabase
      .from('risk_signals')
      .select('institution_id, category, severity, signal_date')
      .gte('signal_date', windowStartIso)
      .order('signal_date', { ascending: false })
      .limit(SIGNAL_ROW_LIMIT)
    if (signalError) throw signalError
    const allSignals = (signalRows ?? []) as SignalRow[]
    if (allSignals.length >= ROW_CAP) {
      console.warn(
        `[compute-risk-score] risk_signals read returned ${allSignals.length} rows; PostgREST max_rows may have truncated the window`,
      )
    }
    const signalsByInstitution = new Map<string, SignalRow[]>()
    for (const signal of allSignals) {
      const list = signalsByInstitution.get(signal.institution_id)
      if (list) list.push(signal)
      else signalsByInstitution.set(signal.institution_id, [signal])
    }

    // First pass: individual scores.
    const results: ScoredInstitution[] = []
    for (const inst of institutions) {
      const signals = signalsByInstitution.get(inst.id) ?? []
      const categoryScores: Record<string, number> = {}

      for (const signal of signals) {
        const daysAgo =
          (runAtMs - new Date(signal.signal_date).getTime()) / DAY_MS
        const decayFactor = Math.exp(-DECAY_LAMBDA * daysAgo)
        const severityValue = SEVERITY_VALUES[signal.severity] ?? 10
        const contribution = severityValue * decayFactor
        categoryScores[signal.category] =
          (categoryScores[signal.category] ?? 0) + contribution
      }

      let compositeScore = 0
      const components: Record<string, number> = {}
      const weightsUsed: Record<string, number> = {}

      for (const [category, rawScore] of Object.entries(categoryScores)) {
        const normalizedScore = Math.min(rawScore, 100)
        const weight = weightFor(category)
        const weightedScore = normalizedScore * weight
        components[category] = Number(normalizedScore.toFixed(2))
        weightsUsed[category] = weight
        compositeScore += weightedScore
      }

      results.push({
        institution_id: inst.id,
        name: inst.name,
        sector: inst.sector,
        score: toDisplayScore(Math.min(compositeScore, 100)),
        rawScore: Math.min(compositeScore, 100),
        components,
        weightsUsed,
        signalCount: signals.length,
      })
    }

    // Second pass: peer contagion, decided from the same in-memory signal set.
    const contagionSinceMs = runAtMs - DAY_MS
    const contagionRows: Array<Record<string, unknown>> = []
    const contagionQueued = new Set<string>()
    for (const result of results) {
      const prevScore = prevScores.get(result.institution_id) ?? 0
      const scoreDelta = result.score - prevScore
      if (scoreDelta <= CONTAGION_DELTA) continue

      const peers = results.filter(
        (r) =>
          r.institution_id !== result.institution_id &&
          r.sector !== null &&
          r.sector === result.sector,
      )
      const severity = scoreDelta > CONTAGION_HIGH_DELTA ? 'high' : 'medium'

      for (const peer of peers) {
        // At most one peer_contagion signal per bank per 24 h.
        if (contagionQueued.has(peer.institution_id)) continue
        const recent = (
          signalsByInstitution.get(peer.institution_id) ?? []
        ).some(
          (s) =>
            s.category === 'peer_contagion' &&
            Date.parse(s.signal_date) >= contagionSinceMs,
        )
        if (recent) continue

        contagionQueued.add(peer.institution_id)
        contagionRows.push({
          institution_id: peer.institution_id,
          category: 'peer_contagion',
          severity,
          title: `Peer risk spike: ${result.name} score jumped +${scoreDelta.toFixed(0)} points`,
          description: `${result.name} (same sector: ${result.sector}) risk score increased from ${prevScore.toFixed(1)} to ${result.score.toFixed(1)}. This pattern may indicate sector-wide stress. SVB's collapse triggered contagion to First Republic, Signature Bank, and other regionals.`,
          signal_value: scoreDelta,
          signal_date: runAtIso,
          source: 'Peer analysis',
        })
      }
    }
    if (contagionRows.length > 0) {
      const { error: contagionError } = await supabase
        .from('risk_signals')
        .insert(contagionRows)
      if (contagionError) {
        console.error(
          `[compute-risk-score] peer_contagion insert failed: ${contagionError.message}`,
        )
      } else {
        console.log(
          `[compute-risk-score] raised ${contagionRows.length} peer_contagion signals`,
        )
      }
    }

    // Save every score in one upsert; reruns inside the hour overwrite.
    const rows = results.map((r) => ({
      institution_id: r.institution_id,
      score: Number(r.score.toFixed(2)),
      // `_weights` records the weight applied per category so the row is
      // self-describing; readers list categories with componentEntries(),
      // which skips non-numeric values.
      score_components: {
        ...r.components,
        _weights: r.weightsUsed,
        _raw: Number(r.rawScore.toFixed(4)),
      },
      signal_count: r.signalCount,
      computed_at: runAtIso,
    }))
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('risk_scores')
        .upsert(rows, { onConflict: 'institution_id,computed_at' })
      if (upsertError) throw upsertError
    }

    return json({
      success: true,
      computed_at: runAtIso,
      results: results.map((r) => ({
        institution_id: r.institution_id,
        score: Number(r.score.toFixed(2)),
        components: r.components,
      })),
    })
  } catch (error) {
    console.error('compute-risk-score failed:', error)
    return json({ error: String(error) }, 500)
  }
})
