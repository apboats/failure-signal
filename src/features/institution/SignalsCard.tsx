import { useId, useMemo, useState } from 'react'
import type { RiskSignal, SignalCategory, SignalSeverity } from '@shared/types'
import {
  listForInstitution,
  SIGNAL_PAGE_SIZE,
  type SignalListOptions,
} from '@/api/signals'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  ListRows,
  PageState,
  SegmentedControl,
  Select,
} from '@/components/ui'
import {
  categoryColor,
  categoryLabel,
  isSignalCategory,
  severityLabel,
  severityTone,
  SIGNAL_CATEGORY_KEYS,
} from '@/domain/signals'
import { formatCount, formatDate } from '@/lib/format'
import { queryKeys } from '@/queries/keys'
import { ListSkeleton } from './ListSkeleton'
import { usePagedList } from './usePagedList'

type SeverityFilter = SignalSeverity | 'all'
type CategoryFilter = SignalCategory | 'all'

const SEVERITIES: readonly SignalSeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
]

const SEVERITY_OPTIONS: readonly { value: SeverityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...SEVERITIES.map((severity) => ({
    value: severity,
    label: severityLabel(severity),
  })),
]

function SignalRow({ signal }: { signal: RiskSignal }) {
  const tone = severityTone(signal.severity)
  return (
    <ListRow
      accent={tone}
      leading={<Badge tone={tone}>{severityLabel(signal.severity)}</Badge>}
      title={signal.title}
      meta={
        <>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-2 rounded-full align-middle"
            style={{ backgroundColor: categoryColor(signal.category) }}
          />
          {categoryLabel(signal.category)} · {formatDate(signal.signal_date)}
          {signal.description ? (
            <span className="mt-1 line-clamp-2 block">
              {signal.description}
            </span>
          ) : null}
        </>
      }
    />
  )
}

/**
 * The bank's risk signals, newest first, filtered by category and severity,
 * with the exact total in the header and Load more in pages of 50.
 */
export function SignalsCard({ institutionId }: { institutionId: string }) {
  const categoryId = useId()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const filter = useMemo<SignalListOptions>(() => {
    const opts: SignalListOptions = {}
    if (category !== 'all') opts.category = category
    if (severity !== 'all') opts.severity = severity
    return opts
  }, [category, severity])
  const filtered = category !== 'all' || severity !== 'all'

  const list = usePagedList<RiskSignal>({
    queryKey: [...queryKeys.signals(institutionId, filter), 'pages'],
    pageSize: SIGNAL_PAGE_SIZE,
    fetchPage: (offset) =>
      listForInstitution(institutionId, { ...filter, offset }),
  })

  if (list.isError)
    return (
      <PageState
        kind="error"
        title="Could not load signals"
        error={list.error}
        onRetry={list.refetch}
      />
    )

  const countKnown = !list.isPending && !list.isPlaceholderData
  return (
    <Card title="Signals" count={countKnown ? list.total : null} padded={false}>
      <div className="divide-y divide-border">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-5">
          <label htmlFor={categoryId} className="sr-only">
            Category
          </label>
          <Select
            id={categoryId}
            value={category}
            onChange={(event) => {
              const value = event.target.value
              setCategory(isSignalCategory(value) ? value : 'all')
            }}
            className="max-w-48"
          >
            <option value="all">All categories</option>
            {SIGNAL_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {categoryLabel(key)}
              </option>
            ))}
          </Select>
          <SegmentedControl
            aria-label="Severity"
            size="sm"
            options={SEVERITY_OPTIONS}
            value={severity}
            onChange={setSeverity}
          />
        </div>

        {list.isPending ? (
          <ListSkeleton />
        ) : list.rows.length === 0 ? (
          <EmptyState
            title={
              filtered
                ? 'No signals match these filters'
                : 'No signals for this bank'
            }
            body={
              filtered
                ? 'Clear the category or severity filter.'
                : 'None detected yet from news, filings, market or social data.'
            }
          />
        ) : (
          <div
            aria-busy={list.isPlaceholderData || undefined}
            className={list.isPlaceholderData ? 'opacity-60' : undefined}
          >
            <ListRows>
              {list.rows.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </ListRows>
          </div>
        )}

        {list.hasMore && list.total !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5">
            <span className="text-xs text-muted tabular-nums">
              Showing {formatCount(list.rows.length)} of{' '}
              {formatCount(list.total)}
            </span>
            <Button
              size="sm"
              onClick={list.loadMore}
              loading={list.isLoadingMore}
              disabled={list.isPlaceholderData}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
