import { caseStudies, type CaseStudyId } from '@/content/caseStudies'
import { SegmentedControl } from '@/components/ui'

export interface StudySwitcherProps {
  value: CaseStudyId
  onChange: (id: CaseStudyId) => void
}

const options = caseStudies.map((study) => ({
  value: study.id,
  label: study.name,
}))

/** Picks the case study the page shows. */
export function StudySwitcher({ value, onChange }: StudySwitcherProps) {
  return (
    <SegmentedControl
      aria-label="Case study"
      options={options}
      value={value}
      onChange={onChange}
    />
  )
}
