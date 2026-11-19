import { useMemo } from 'react'
import { getRiskLevel } from '@shared/constants'
import { SHORT_ENTRY, SHORT_EXIT, WATCH } from '@shared/thresholds'
import type { CaseStudy, TimelineEvent } from '@/content/caseStudies'
import { Badge, Card, ListRow, ListRows, ScoreValue } from '@/components/ui'
import { EM_DASH } from '@/lib/format'
import {
  eventDateTime,
  formatEventDate,
  thresholdFirings,
  type ThresholdFirings,
} from './studyData'

export interface ThresholdsCardProps {
  study: CaseStudy
}

interface ThresholdRow {
  key: keyof ThresholdFirings
  label: string
  /** The band the threshold opens, so the badge matches the chart's dashed line. */
  tone: ReturnType<typeof getRiskLevel>['token']
  value: string
  rule: string
}

const ROWS: readonly ThresholdRow[] = [
  {
    key: 'watch',
    label: 'Watch',
    tone: getRiskLevel(WATCH).token,
    value: `≥ ${WATCH}`,
    rule: 'Elevated or above',
  },
  {
    key: 'shortEntry',
    label: 'Short entry',
    tone: getRiskLevel(SHORT_ENTRY).token,
    value: `≥ ${SHORT_ENTRY}`,
    rule: 'High or above',
  },
  {
    key: 'shortExit',
    label: 'Short exit',
    // The exit rule is "below SHORT_EXIT", which is the Low band.
    tone: getRiskLevel(0).token,
    value: `< ${SHORT_EXIT}`,
    rule: 'Back to Low after a short entry',
  },
]

function Firing({ event }: { event: TimelineEvent | null }) {
  if (!event) {
    return (
      <span className="text-sm text-muted">
        {EM_DASH}
        <span className="sr-only">never fired</span>
      </span>
    )
  }
  return (
    <>
      <time dateTime={eventDateTime(event)} className="text-sm text-text">
        {formatEventDate(event)}
      </time>
      <ScoreValue score={event.score} size="sm" />
    </>
  )
}

/**
 * The live thresholds from shared/thresholds.ts and the first event each would
 * have fired on for this study, followed by the signal-level rules the study
 * argues for.
 */
export function ThresholdsCard({ study }: ThresholdsCardProps) {
  const firings = useMemo(() => thresholdFirings(study.timeline), [study])
  return (
    <Card title="Thresholds" count="first fired" padded={false}>
      <div className="divide-y divide-border">
        <ListRows>
          {ROWS.map((row) => (
            <ListRow
              key={row.key}
              leading={
                <Badge tone={row.tone} className="tabular-nums">
                  {row.value}
                </Badge>
              }
              title={row.label}
              meta={row.rule}
              trailing={<Firing event={firings[row.key]} />}
            />
          ))}
        </ListRows>
        <div className="p-4 md:p-5">
          <h3 className="text-sm font-medium text-text">
            Rules this study argues for
          </h3>
          <ul className="mt-2 space-y-2">
            {study.lessons.map((lesson) => (
              <li key={lesson.signal}>
                <span className="block text-sm text-text">{lesson.signal}</span>
                <span className="block text-xs text-muted">
                  {lesson.threshold}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
