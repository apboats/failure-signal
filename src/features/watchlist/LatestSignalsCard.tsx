import {
  Badge,
  Card,
  EmptyState,
  ListRows,
  ListRow,
  Skeleton,
} from '@/components/ui'
import { riskLevelOf, scoreTone } from '@/domain/risk'
import {
  categoryColor,
  categoryLabel,
  severityLabel,
  severityTone,
} from '@/domain/signals'
import { EM_DASH, formatRelative, formatScore } from '@/lib/format'
import type { Institution, SignalCategory } from '@shared/types'
import { QueryErrorNote } from './QueryErrorNote'
import {
  LATEST_EVENTS,
  type SecondaryStatus,
  type WatchlistEvent,
} from './useWatchlistData'

export interface LatestSignalsCardProps {
  events: readonly WatchlistEvent[]
  /** id -> institution, for the ticker and the inactive tag. */
  index: ReadonlyMap<string, Institution>
  status: {
    latestSignals: SecondaryStatus
    history: SecondaryStatus
  }
  now: number
}

function SkeletonRows() {
  return (
    <ListRows>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 md:px-5">
          <span className="min-w-0 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-40" />
          </span>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ListRows>
  )
}

/** Neutral chip with the category's colour as a small dot, never a background. */
function CategoryBadge({ category }: { category: SignalCategory }) {
  return (
    <Badge
      size="sm"
      tone="neutral"
      icon={
        <svg viewBox="0 0 12 12" role="presentation">
          <circle cx="6" cy="6" r="4" fill={categoryColor(category)} />
        </svg>
      }
    >
      {categoryLabel(category)}
    </Badge>
  )
}

function BankTag({ institution }: { institution: Institution | undefined }) {
  if (!institution) return <span className="text-muted">{EM_DASH}</span>
  return (
    <>
      <span className="font-medium text-text">
        {institution.ticker ?? institution.name}
      </span>
      {institution.is_active ? null : (
        <Badge size="sm" tone="neutral">
          Inactive
        </Badge>
      )}
    </>
  )
}

/**
 * The newest risk signals and alert events merged by time. Each row links to
 * the bank; the left accent and the badges carry severity, the category is a
 * neutral chip with a colour dot.
 */
export function LatestSignalsCard({
  events,
  index,
  status,
  now,
}: LatestSignalsCardProps) {
  const loading = status.latestSignals.isPending || status.history.isPending
  const failed = Boolean(status.latestSignals.error || status.history.error)
  const nowDate = new Date(now)

  return (
    <Card
      title="Latest signals"
      padded={false}
      action={
        <span className="text-xs text-muted">
          newest {LATEST_EVENTS} risk signals and alerts
        </span>
      }
    >
      <QueryErrorNote source="Signals" status={status.latestSignals} />
      <QueryErrorNote source="Alert history" status={status.history} />
      {loading && !failed ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading signals</span>
          <SkeletonRows />
        </div>
      ) : events.length === 0 ? (
        failed ? null : (
          <EmptyState
            title="No signals yet"
            body="The hourly news, filings, market and social scans write risk signals here; alerts appear when a bank crosses a threshold."
          />
        )
      ) : (
        <ListRows>
          {events.map((event) => {
            const institution = index.get(event.institutionId)
            const time = (
              <span className="text-xs whitespace-nowrap text-muted">
                {formatRelative(event.at, nowDate)}
              </span>
            )
            if (event.kind === 'signal') {
              const { signal } = event
              return (
                <ListRow
                  key={event.id}
                  to={`/institution/${event.institutionId}`}
                  accent={severityTone(signal.severity)}
                  title={<span className="block truncate">{signal.title}</span>}
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <CategoryBadge category={signal.category} />
                      <Badge size="sm" tone={severityTone(signal.severity)}>
                        {severityLabel(signal.severity)}
                      </Badge>
                      <BankTag institution={institution} />
                    </span>
                  }
                  trailing={time}
                />
              )
            }
            const { alert } = event
            const level = riskLevelOf(alert.triggered_score)
            return (
              <ListRow
                key={event.id}
                to={`/institution/${event.institutionId}`}
                accent={scoreTone(alert.triggered_score)}
                title={
                  <span className="block truncate">
                    {alert.trigger_reason ??
                      `Alert fired at score ${formatScore(alert.triggered_score)}`}
                  </span>
                }
                meta={
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" tone="accent">
                      Alert
                    </Badge>
                    <Badge size="sm" tone={scoreTone(alert.triggered_score)}>
                      {level
                        ? `${level.label} ${formatScore(alert.triggered_score)}`
                        : 'No score'}
                    </Badge>
                    <BankTag institution={institution} />
                  </span>
                }
                trailing={time}
              />
            )
          })}
        </ListRows>
      )}
    </Card>
  )
}
