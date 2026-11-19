import {
  getRiskLevel,
  RISK_LEVELS,
  SCORE_MAX,
  type RiskLevel,
  type RiskLevelLabel,
} from '@shared/constants'
import { SEVERE, WATCH } from '@shared/thresholds'
import type { Tone } from '@shared/types'

export { getRiskLevel, RISK_LEVELS, SCORE_MAX }
export type { RiskLevel, RiskLevelLabel }

/** Band for a possibly-missing score; null when there is no score to classify. */
export function riskLevelOf(
  score: number | null | undefined,
): RiskLevel | null {
  return score === null || score === undefined ? null : getRiskLevel(score)
}

/** Badge/text tone for a score: the band's risk token, or 'neutral' for "no score yet". */
export function scoreTone(score: number | null | undefined): Tone {
  return riskLevelOf(score)?.token ?? 'neutral'
}

/** "Elevated or above" everywhere means score >= WATCH. Null is never elevated. */
export function isElevated(score: number | null | undefined): boolean {
  return score !== null && score !== undefined && score >= WATCH
}

/** Score change, or null when either side is missing (never coalesce a missing score to 0). */
export function scoreDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  )
    return null
  return current - previous
}

/**
 * Upper bound for a score axis: never below SEVERE so the bands stay visible,
 * and 20% headroom above the largest value so the line never touches the top.
 */
export function scoreAxisMax(values: readonly number[]): number {
  let max = 0
  for (const value of values)
    if (Number.isFinite(value) && value > max) max = value
  return Math.max(SEVERE, Math.ceil(max * 1.2))
}
