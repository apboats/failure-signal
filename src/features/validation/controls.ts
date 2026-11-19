/**
 * Control values and defaults shared by the Validation tabs. Kept apart from
 * the components so the component files export components only.
 */
import { SCORE_SPIKE, WATCH } from '@shared/thresholds'
import type { EventDef } from '@/domain/analytics/eventStudy'

export type EventKind = 'level' | 'velocity'

export interface EventControlsValue {
  kind: EventKind
  /** Level: fire when the score first reaches this. */
  levelThreshold: number
  /** Velocity: fire when the score rose by at least this many points... */
  velocityDelta: number
  /** ...over this many trading days. */
  velocityWindow: number
  benchmarkTicker: string
}

export const BENCHMARK_TICKERS: readonly string[] = ['XLF', 'SPY']
export const MAX_VELOCITY_WINDOW = 20

export const DEFAULT_EVENT_CONTROLS: EventControlsValue = {
  kind: 'level',
  levelThreshold: WATCH,
  velocityDelta: SCORE_SPIKE,
  velocityWindow: 5,
  benchmarkTicker: BENCHMARK_TICKERS[0],
}

export function toEventDef(value: EventControlsValue): EventDef {
  return value.kind === 'level'
    ? { kind: 'level', threshold: value.levelThreshold }
    : {
        kind: 'velocity',
        delta: value.velocityDelta,
        windowDays: value.velocityWindow,
      }
}

export const LAG_OPTIONS = [1, 3, 7, 14] as const
export type LagDays = (typeof LAG_OPTIONS)[number]
export const DEFAULT_LAG: LagDays = 3

export function isLagDays(value: number): value is LagDays {
  return (LAG_OPTIONS as readonly number[]).includes(value)
}
