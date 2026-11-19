import { describe, expect, it } from 'vitest'
import { SEVERITY_LEVELS } from '@shared/constants'
import { isSignalCategory } from '@/domain/signals'
import { bearStearns } from './bearStearns'
import { CASE_STUDY_IDS, caseStudies, getCaseStudy } from './index'
import { svb } from './svb'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

describe('case study content', () => {
  it('carries every event from the retired HistoricalAnalysis page', () => {
    // 21 SVB + 14 Bear Stearns events in the old file; the content is data and keeps all of them.
    expect(svb.timeline).toHaveLength(21)
    expect(bearStearns.timeline).toHaveLength(14)
  })

  it('lists SVB first and resolves ids', () => {
    expect(caseStudies.map((study) => study.id)).toEqual(['svb', 'bear'])
    expect(CASE_STUDY_IDS).toEqual(['svb', 'bear'])
    expect(getCaseStudy('bear')).toBe(bearStearns)
    expect(getCaseStudy('nope')).toBe(svb)
  })

  it.each(caseStudies.map((study) => [study.id, study] as const))(
    '%s timeline is chronological with valid enums and non-decreasing scores',
    (_id, study) => {
      let lastDate = ''
      let lastScore = -Infinity
      for (const event of study.timeline) {
        expect(event.date).toMatch(ISO_DAY)
        expect(event.date >= lastDate).toBe(true)
        lastDate = event.date
        expect(isSignalCategory(event.category)).toBe(true)
        expect(SEVERITY_LEVELS[event.severity]).toBeDefined()
        expect(Number.isFinite(event.score)).toBe(true)
        expect(event.score >= lastScore).toBe(true)
        lastScore = event.score
        if (event.precision === 'month')
          expect(event.date.endsWith('-01')).toBe(true)
        expect(event.title.length).toBeGreaterThan(0)
        expect(event.description.length).toBeGreaterThan(0)
      }
      expect(study.lessons).toHaveLength(6)
      expect(study.summary.length).toBeGreaterThan(0)
      expect(study.outcome.length).toBeGreaterThan(0)
    },
  )

  it('keeps the modelled scores inside the live index range', () => {
    for (const study of caseStudies)
      for (const event of study.timeline) {
        expect(event.score).toBeGreaterThanOrEqual(0)
        expect(event.score).toBeLessThanOrEqual(100)
      }
  })
})
