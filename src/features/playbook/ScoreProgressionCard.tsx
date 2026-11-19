import { useMemo } from 'react'
import type { CaseStudy } from '@/content/caseStudies'
import { Card } from '@/components/ui'
import { ScoreChart } from '@/components/charts/ScoreChart'
import { progressionPoints } from './studyData'

export interface ScoreProgressionCardProps {
  study: CaseStudy
}

/**
 * The modelled score over the study's events on the shared ScoreChart, so the
 * risk bands and the dashed WATCH / SHORT_ENTRY lines are the live ones.
 */
export function ScoreProgressionCard({ study }: ScoreProgressionCardProps) {
  const points = useMemo(() => progressionPoints(study.timeline), [study])
  return (
    <Card title="Score progression">
      <p className="text-xs text-muted">
        Modelled on the live index from the events below, {study.period}; the
        signal did not exist at the time. Bands and dashed lines are
        today&rsquo;s thresholds.
      </p>
      {/* range="30d" only changes the marks: one dot per event date. */}
      <ScoreChart points={points} range="30d" height={300} className="mt-3" />
    </Card>
  )
}
