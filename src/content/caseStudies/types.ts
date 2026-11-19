import type { SignalCategory, SignalSeverity } from '@shared/types'

export type CaseStudyId = 'svb' | 'bear'

/** How precisely the source dates an event. */
export type DatePrecision = 'day' | 'month'

export interface TimelineEvent {
  /**
   * ISO 'YYYY-MM-DD' (parse with parseISO, never new Date('YYYY-MM-DD')).
   * For a month-precision event this is the first of that month.
   */
  date: string
  /** 'month' when the source only dates the event to a month; the timeline then shows 'MMM yyyy'. */
  precision?: DatePrecision
  category: SignalCategory
  severity: SignalSeverity
  title: string
  description: string
  /** Share price around the event as the source reported it ('~$91', '$106', '~$35 (halted)'). */
  stockPrice?: string
  /**
   * Modelled risk index after this event, on the live scale whose bands come
   * from shared/thresholds.ts. The index did not exist at the time, so this is
   * an illustration of how the signal would have progressed, not a measurement.
   * Non-decreasing along the timeline; same-day events step up in order.
   */
  score: number
}

/** A signal-level rule the study argues an early-warning system should carry. */
export interface CaseLesson {
  signal: string
  threshold: string
}

export interface CaseStudy {
  id: CaseStudyId
  name: string
  ticker: string
  /** Tagline, e.g. 'The 44-Hour Collapse'. */
  subtitle: string
  /** Human-readable span the timeline covers, e.g. 'March 2022 – March 2023'. */
  period: string
  /** What happened, in one paragraph. */
  summary: string
  /** What a monitoring system would have shown, and how early. */
  outcome: string
  /** Ascending by date. */
  timeline: readonly TimelineEvent[]
  lessons: readonly CaseLesson[]
}
