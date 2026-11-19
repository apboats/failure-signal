import type { CaseStudy, TimelineEvent } from '@/content/caseStudies'
import { Badge, Card, ListRow, ListRows, cx } from '@/components/ui'
import {
  categoryColor,
  categoryLabel,
  severityLabel,
  severityTone,
} from '@/domain/signals'
import { EM_DASH, formatCount } from '@/lib/format'
import { eventDateTime, formatEventDate } from './studyData'

export interface CaseTimelineProps {
  study: CaseStudy
}

/** The SIGNAL_CATEGORIES colour as a small dot beside the category label (never a background). */
function CategoryDot({ category }: { category: TimelineEvent['category'] }) {
  return (
    <span
      className="size-2 rounded-full"
      style={{ backgroundColor: categoryColor(category) }}
    />
  )
}

function EventRow({ event }: { event: TimelineEvent }) {
  const tone = severityTone(event.severity)
  return (
    <ListRow
      accent={tone}
      title={
        <>
          <span className="font-medium">{event.title}</span>
          <span className="mt-1 block text-muted">{event.description}</span>
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <time dateTime={eventDateTime(event)} className="tabular-nums">
            {formatEventDate(event)}
          </time>
          <Badge
            tone="neutral"
            size="sm"
            icon={<CategoryDot category={event.category} />}
          >
            {categoryLabel(event.category)}
          </Badge>
          <Badge tone={tone} size="sm">
            {severityLabel(event.severity)}
          </Badge>
        </span>
      }
      trailing={
        <span
          className={cx(
            'text-sm whitespace-nowrap tabular-nums',
            event.stockPrice ? 'text-text' : 'text-muted',
          )}
        >
          {event.stockPrice ?? EM_DASH}
          {event.stockPrice ? null : (
            <span className="sr-only">no price recorded</span>
          )}
        </span>
      }
    />
  )
}

/** Every event of the study, one ListRow each: severity accent, date and badges as meta, price trailing. */
export function CaseTimeline({ study }: CaseTimelineProps) {
  return (
    <Card
      title="Timeline"
      count={`${formatCount(study.timeline.length)} events`}
      padded={false}
    >
      <ListRows>
        {study.timeline.map((event, index) => (
          <EventRow key={`${event.date}-${index}`} event={event} />
        ))}
      </ListRows>
    </Card>
  )
}
