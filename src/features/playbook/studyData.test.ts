import { describe, expect, it } from 'vitest'
import { SHORT_ENTRY, SHORT_EXIT, WATCH } from '@shared/thresholds'
import type { TimelineEvent } from '@/content/caseStudies'
import { bearStearns } from '@/content/caseStudies/bearStearns'
import { svb } from '@/content/caseStudies/svb'
import {
  eventDateTime,
  formatEventDate,
  progressionPoints,
  thresholdFirings,
} from './studyData'

function event(
  date: string,
  score: number,
  extra: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    date,
    score,
    title: `t${score}`,
    description: 'd',
    category: 'stock_drop',
    severity: 'low',
    ...extra,
  }
}

describe('progressionPoints', () => {
  it('collapses same-day events to one point carrying the highest score', () => {
    const points = progressionPoints([
      event('2023-03-08', 21),
      event('2023-03-08', 29),
      event('2023-03-09', 31),
    ])
    expect(points).toEqual([
      { date: '2023-03-08', score: 29 },
      { date: '2023-03-09', score: 31 },
    ])
  })

  it('sorts by date and is empty for an empty timeline', () => {
    expect(progressionPoints([])).toEqual([])
    expect(
      progressionPoints([event('2023-02-01', 2), event('2023-01-01', 1)]).map(
        (p) => p.date,
      ),
    ).toEqual(['2023-01-01', '2023-02-01'])
  })

  it('yields one point per distinct date of the real studies', () => {
    for (const study of [svb, bearStearns]) {
      const distinct = new Set(study.timeline.map((e) => e.date)).size
      expect(progressionPoints(study.timeline)).toHaveLength(distinct)
    }
  })
})

describe('thresholdFirings', () => {
  it('finds the first crossing of WATCH and SHORT_ENTRY and the exit after the entry', () => {
    const timeline = [
      event('2024-01-01', WATCH - 1),
      event('2024-01-02', WATCH),
      event('2024-01-03', SHORT_ENTRY),
      event('2024-01-04', SHORT_ENTRY + 3),
      event('2024-01-05', SHORT_EXIT - 1),
    ]
    const firings = thresholdFirings(timeline)
    expect(firings.watch?.date).toBe('2024-01-02')
    expect(firings.shortEntry?.date).toBe('2024-01-03')
    expect(firings.shortExit?.date).toBe('2024-01-05')
  })

  it('never reports an exit before an entry, and null when nothing fires', () => {
    const noEntry = thresholdFirings([
      event('2024-01-01', SHORT_EXIT - 1),
      event('2024-01-02', WATCH),
    ])
    expect(noEntry.watch?.date).toBe('2024-01-02')
    expect(noEntry.shortEntry).toBeNull()
    expect(noEntry.shortExit).toBeNull()

    const nothing = thresholdFirings([event('2024-01-01', 1)])
    expect(nothing).toEqual({ watch: null, shortEntry: null, shortExit: null })
    expect(thresholdFirings([])).toEqual({
      watch: null,
      shortEntry: null,
      shortExit: null,
    })
  })

  it('fires on the modelled studies months before failure and never exits', () => {
    const s = thresholdFirings(svb.timeline)
    expect(s.watch?.date).toBe('2022-10-20')
    expect(s.shortEntry?.date).toBe('2023-02-01')
    expect(s.shortExit).toBeNull()

    const b = thresholdFirings(bearStearns.timeline)
    expect(b.watch?.date).toBe('2008-03-10')
    expect(b.shortEntry?.date).toBe('2008-03-13')
    expect(b.shortExit).toBeNull()
  })
})

describe('event dates', () => {
  it('formats a day event as MMM d, yyyy and a month event as MMM yyyy', () => {
    expect(formatEventDate({ date: '2023-03-08' })).toBe('Mar 8, 2023')
    expect(formatEventDate({ date: '2022-11-01', precision: 'month' })).toBe(
      'Nov 2022',
    )
  })

  it('gives <time> a value at the event precision', () => {
    expect(eventDateTime({ date: '2023-03-08' })).toBe('2023-03-08')
    expect(eventDateTime({ date: '2022-11-01', precision: 'month' })).toBe(
      '2022-11',
    )
  })
})
