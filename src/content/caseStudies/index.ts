import { bearStearns } from './bearStearns'
import { svb } from './svb'
import type { CaseStudy, CaseStudyId } from './types'

export type {
  CaseLesson,
  CaseStudy,
  CaseStudyId,
  DatePrecision,
  TimelineEvent,
} from './types'

/** Display order: the most recent failure first. */
export const caseStudies: readonly CaseStudy[] = [svb, bearStearns]

export const CASE_STUDY_IDS: readonly CaseStudyId[] = caseStudies.map(
  (study) => study.id,
)

/** The study with this id, or the first study for an unknown id. */
export function getCaseStudy(id: string): CaseStudy {
  return caseStudies.find((study) => study.id === id) ?? caseStudies[0]
}
