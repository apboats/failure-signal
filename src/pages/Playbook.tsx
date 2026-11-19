import { CASE_STUDY_IDS, getCaseStudy } from '@/content/caseStudies'
import { PageHeader, useTabParam } from '@/components/ui'
import { CaseTimeline } from '@/features/playbook/CaseTimeline'
import { ScoreProgressionCard } from '@/features/playbook/ScoreProgressionCard'
import { StudySwitcher } from '@/features/playbook/StudySwitcher'
import { SummaryCard } from '@/features/playbook/SummaryCard'
import { ThresholdsCard } from '@/features/playbook/ThresholdsCard'

/** /playbook: the SVB and Bear Stearns case studies against the live thresholds. */
export function Playbook() {
  const [studyId, setStudyId] = useTabParam(CASE_STUDY_IDS, 'study')
  const study = getCaseStudy(studyId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playbook"
        description="What the signal looked like before SVB and Bear Stearns, and how the thresholds would have fired."
        right={<StudySwitcher value={studyId} onChange={setStudyId} />}
      />
      <SummaryCard study={study} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreProgressionCard study={study} />
        <ThresholdsCard study={study} />
      </div>
      <CaseTimeline study={study} />
    </div>
  )
}
