import type { CaseStudy } from '@/content/caseStudies'
import { Card } from '@/components/ui'

export interface SummaryCardProps {
  study: CaseStudy
}

/** The narrative: what happened, and what the signal would have shown. */
export function SummaryCard({ study }: SummaryCardProps) {
  return (
    <Card title={study.name} count={study.ticker}>
      <p className="text-sm font-medium text-text">{study.subtitle}</p>
      <p className="mt-1 text-xs text-muted">{study.period}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{study.summary}</p>
      <h3 className="mt-4 text-sm font-medium text-text">
        What the signal would have shown
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{study.outcome}</p>
    </Card>
  )
}
