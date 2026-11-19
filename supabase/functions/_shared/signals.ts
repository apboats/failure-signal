/**
 * Trading-signal rules for daily-snapshot, as a pure function.
 *
 * daily-snapshot gathers today's score, the previous snapshot and the open
 * short_entry for a bank and asks this module which signals to emit. Keeping
 * the rules here, with no I/O, lets vitest cover every branch under Node.
 *
 * Rules (thresholds from ./thresholds.ts, mirrored from shared/thresholds.ts):
 *
 * - short_entry: score >= SHORT_ENTRY and either it crossed SHORT_ENTRY since
 *   the previous snapshot or it jumped >= SCORE_SPIKE in one day. One entry per
 *   run, with a combined reason when both apply. An entry supersedes any watch
 *   or exit the same run.
 * - short_exit: only while a short_entry is open, once the score falls below
 *   max(SHORT_EXIT, half the entry score). The reason says when the fall is
 *   pure time decay (no new risk signals since entry) rather than resolved risk.
 * - watch: WATCH <= score < SHORT_ENTRY and either it crossed WATCH since the
 *   previous snapshot or it jumped >= SCORE_SPIKE in one day. Never in the same
 *   run as a short_entry or short_exit.
 * - No previous snapshot (`prevScore` null) means no crossing or spike signals:
 *   a first observation is not a move. A short_exit is state-based and can
 *   still fire against an open entry.
 *
 * At most one signal per type per run: the result is a Map keyed by type.
 * Scores in reasons render as an index ('12.0'), never as a percentage.
 */
import { SCORE_SPIKE, SHORT_ENTRY, SHORT_EXIT, WATCH } from './thresholds.ts'

export type TradingSignalType = 'short_entry' | 'short_exit' | 'watch'

/** The institution's active short_entry, when one exists. */
export interface OpenEntry {
  /** Risk score when the entry was emitted. */
  score_at_signal: number
  /**
   * The institution's signal count when the entry was emitted. A larger
   * `signalCount` now means new risk signals arrived since entry; equal or
   * smaller means the score moved on time decay alone.
   */
  signal_count_at_entry: number
  /** Whole days the entry has been open; used in the decay-only wording. */
  days_open?: number
}

export interface SignalInput {
  /** Today's score (the latest risk_scores row). */
  currentScore: number
  /** Score of the latest snapshot strictly before today, or null when none. */
  prevScore: number | null
  /** Today's 30-day signal count (risk_scores.signal_count). */
  signalCount: number
  /** The previous snapshot's signal count, or null when there is no snapshot. */
  prevSignalCount: number | null
  openEntry: OpenEntry | null
}

/** One decimal, no suffix: scores are an index, never a percentage. */
export function formatScore(score: number): string {
  return score.toFixed(1)
}

/** '+6.0' / '-2.5' for a one-day change. */
export function formatChange(change: number): string {
  const text = Math.abs(change).toFixed(1)
  return change < 0 ? `-${text}` : `+${text}`
}

/** The score below which an open short at `entryScore` is closed. */
export function shortExitLevel(entryScore: number): number {
  return Math.max(SHORT_EXIT, 0.5 * entryScore)
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** 'N new risk signals since the previous snapshot.' or '' when none or unknown. */
function newSinceSnapshot(
  signalCount: number,
  prevSignalCount: number | null,
): string {
  if (prevSignalCount === null) return ''
  const added = signalCount - prevSignalCount
  if (added <= 0) return ''
  return ` ${plural(added, 'new risk signal')} since the previous snapshot.`
}

export function generateTradingSignals(
  input: SignalInput,
): Map<TradingSignalType, string> {
  const { currentScore, prevScore, signalCount, prevSignalCount, openEntry } =
    input
  const out = new Map<TradingSignalType, string>()

  const change = prevScore === null ? null : currentScore - prevScore
  const spiked = change !== null && change >= SCORE_SPIKE
  const crossedEntry =
    prevScore !== null && prevScore < SHORT_ENTRY && currentScore >= SHORT_ENTRY
  const crossedWatch =
    prevScore !== null && prevScore < WATCH && currentScore >= WATCH
  const evidence = newSinceSnapshot(signalCount, prevSignalCount)

  // Short entry: at or above the entry level, and it got there today.
  if (currentScore >= SHORT_ENTRY && (crossedEntry || spiked)) {
    const now = formatScore(currentScore)
    const was = formatScore(prevScore as number)
    let reason: string
    if (crossedEntry && spiked) {
      reason = `Risk score crossed ${SHORT_ENTRY} (now ${now}, was ${was}), a one-day jump of ${formatChange(change as number)}.`
    } else if (crossedEntry) {
      reason = `Risk score crossed ${SHORT_ENTRY} (now ${now}, was ${was}).`
    } else {
      reason = `Risk score jumped ${formatChange(change as number)} in one day (${was} to ${now}), already above ${SHORT_ENTRY}.`
    }
    out.set('short_entry', reason + evidence)
    return out
  }

  // Short exit: state-based, only against an open entry.
  if (openEntry !== null) {
    const level = shortExitLevel(openEntry.score_at_signal)
    if (currentScore < level) {
      const entry = formatScore(openEntry.score_at_signal)
      const levelText =
        level > SHORT_EXIT
          ? `${formatScore(level)} (half the entry score of ${entry})`
          : `${formatScore(level)} (entered at ${entry})`
      const added = signalCount - openEntry.signal_count_at_entry
      let tail: string
      if (added > 0) {
        tail = ` The ${plural(added, 'risk signal')} added since entry did not hold the score up.`
      } else if (openEntry.days_open === undefined) {
        tail =
          ' No new risk signals since entry: the decline is time decay, not resolved risk.'
      } else if (openEntry.days_open < 1) {
        tail =
          ' No new risk signals since entry today: the decline is time decay, not resolved risk.'
      } else {
        tail = ` No new risk signals in ${plural(openEntry.days_open, 'day')}: the decline is time decay, not resolved risk.`
      }
      out.set(
        'short_exit',
        `Risk score fell to ${formatScore(currentScore)}, below the exit level ${levelText}.${tail}`,
      )
      return out
    }
  }

  // Watch: inside the watch band, and it got there today.
  if (
    currentScore >= WATCH &&
    currentScore < SHORT_ENTRY &&
    (crossedWatch || spiked)
  ) {
    const now = formatScore(currentScore)
    const was = formatScore(prevScore as number)
    let reason: string
    if (spiked && crossedWatch) {
      reason = `Risk score jumped ${formatChange(change as number)} in one day (${was} to ${now}), crossing the watch level ${WATCH}.`
    } else if (spiked) {
      reason = `Risk score jumped ${formatChange(change as number)} in one day (${was} to ${now}), inside the watch band ${WATCH} to ${SHORT_ENTRY}.`
    } else {
      reason = `Risk score rose to ${now} from ${was}, crossing the watch level ${WATCH}.`
    }
    out.set('watch', reason + evidence)
  }

  return out
}
