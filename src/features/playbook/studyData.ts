/**
 * Pure derivations over a case study's timeline: the chart points, the
 * first event each live threshold would have fired on, and the date label
 * that respects an event's precision.
 */
import { SHORT_ENTRY, SHORT_EXIT, WATCH } from '@shared/thresholds'
import type { ScoreHistoryPoint } from '@shared/types'
import type { TimelineEvent } from '@/content/caseStudies'
import { formatDate } from '@/lib/format'

/**
 * One point per distinct date, carrying the highest score recorded that day,
 * so same-day events (which step the score up in order) collapse to the end
 * of the day and the X axis never repeats a category.
 */
export function progressionPoints(
  timeline: readonly TimelineEvent[],
): ScoreHistoryPoint[] {
  const byDate = new Map<string, number>()
  for (const event of timeline) {
    const previous = byDate.get(event.date)
    byDate.set(
      event.date,
      previous === undefined ? event.score : Math.max(previous, event.score),
    )
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, score]) => ({ date, score }))
}

export interface ThresholdFirings {
  /** First event with score >= WATCH, or null if the score never got there. */
  watch: TimelineEvent | null
  /** First event with score >= SHORT_ENTRY, or null. */
  shortEntry: TimelineEvent | null
  /** First event after the short entry with score < SHORT_EXIT, or null (also null without an entry). */
  shortExit: TimelineEvent | null
}

/** When each live threshold (shared/thresholds.ts) would first have fired on the modelled scores. */
export function thresholdFirings(
  timeline: readonly TimelineEvent[],
): ThresholdFirings {
  const watch = timeline.find((event) => event.score >= WATCH) ?? null
  const entryIndex = timeline.findIndex((event) => event.score >= SHORT_ENTRY)
  const shortEntry = entryIndex === -1 ? null : timeline[entryIndex]
  const shortExit =
    entryIndex === -1
      ? null
      : (timeline
          .slice(entryIndex + 1)
          .find((event) => event.score < SHORT_EXIT) ?? null)
  return { watch, shortEntry, shortExit }
}

/** 'Mar 8, 2023', or 'Nov 2022' for an event the source only dates to a month. */
export function formatEventDate(
  event: Pick<TimelineEvent, 'date' | 'precision'>,
): string {
  return event.precision === 'month'
    ? formatDate(event.date, 'MMM yyyy')
    : formatDate(event.date)
}

/** Machine-readable value for <time dateTime>: 'YYYY-MM' for a month-precision event. */
export function eventDateTime(
  event: Pick<TimelineEvent, 'date' | 'precision'>,
): string {
  return event.precision === 'month' ? event.date.slice(0, 7) : event.date
}
