import { Radar } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import {
  Badge,
  ButtonLink,
  Card,
  Checkbox,
  DataTable,
  Delta,
  EmptyState,
  PageState,
  ScoreValue,
  SegmentedControl,
  Select,
  Skeleton,
  type Column,
} from '@/components/ui'
import {
  deriveSignalStatus,
  type SignalOutcome,
  type SignalStatus,
} from '@/domain/tradingSignals'
import {
  TRADING_SIGNAL_TYPES,
  tradingSignalLabel,
  tradingSignalTone,
} from '@/domain/signals'
import {
  EM_DASH,
  formatCurrency,
  formatDate,
  formatDateTimeUTC,
} from '@/lib/format'
import { useInstitutionIndex } from '@/queries/useInstitutions'
import { useLatestPrices } from '@/queries/useLatestPrices'
import { useTradingSignals } from '@/queries/useTradingSignals'
import type {
  Institution,
  LatestPrice,
  TradingSignal,
  TradingSignalType,
} from '@shared/types'
import { BankCell } from './BankCell'
import { openPositionSearch } from './prefill'

type StatusFilter = 'open' | 'closed' | 'all'
type TypeFilter = TradingSignalType | 'all'

interface SignalRow {
  signal: TradingSignal
  institution: Institution | undefined
  outcome: SignalOutcome<TradingSignal>
  latest: LatestPrice | undefined
}

const EMPTY_SIGNALS: readonly TradingSignal[] = []
const EMPTY_PRICES: ReadonlyMap<string, LatestPrice> = new Map()

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
] as const satisfies readonly { value: StatusFilter; label: string }[]

const TYPE_KEYS = Object.keys(TRADING_SIGNAL_TYPES) as TradingSignalType[]

const STATUS_RANK: Record<SignalStatus, number> = {
  open: 0,
  closed: 1,
  'n/a': 2,
}

function StatusBadge({ status }: { status: SignalStatus }) {
  if (status === 'open') return <Badge tone="accent">Open</Badge>
  if (status === 'closed') return <Badge tone="neutral">Closed</Badge>
  return (
    <span className="text-muted" title="Not a position: no open/closed state">
      {EM_DASH}
    </span>
  )
}

function uniqueSorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort()
}

/**
 * Signals tab: every trading signal (active and inactive alike) with the
 * Open/Closed status derived client-side and the short return since the
 * signal, measured against the exit price or the latest priced snapshot.
 */
export function SignalsTab() {
  const signalsQuery = useTradingSignals()
  const indexQuery = useInstitutionIndex()
  const signals = signalsQuery.data ?? EMPTY_SIGNALS
  const institutionIds = useMemo(
    () => uniqueSorted(signals.map((signal) => signal.institution_id)),
    [signals],
  )
  const pricesQuery = useLatestPrices(institutionIds)
  const prices = pricesQuery.data ?? EMPTY_PRICES
  const outcomes = useMemo(
    () => deriveSignalStatus(signals, prices),
    [signals, prices],
  )

  const [status, setStatus] = useState<StatusFilter>('all')
  const [type, setType] = useState<TypeFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const typeId = useId()
  const inactiveId = useId()

  const index = indexQuery.data
  const rows = useMemo<SignalRow[]>(() => {
    const result: SignalRow[] = []
    for (const signal of signals) {
      const institution = index.get(signal.institution_id)
      if (institution && !institution.is_active && !showInactive) continue
      const outcome = outcomes.get(signal.id)
      if (!outcome) continue
      if (status !== 'all' && outcome.status !== status) continue
      if (type !== 'all' && signal.signal_type !== type) continue
      result.push({
        signal,
        institution,
        outcome,
        latest: prices.get(signal.institution_id),
      })
    }
    return result
  }, [signals, index, outcomes, prices, status, type, showInactive])

  const hiddenInactive = useMemo(
    () =>
      signals.filter(
        (signal) => index.get(signal.institution_id)?.is_active === false,
      ).length,
    [signals, index],
  )

  const error = signalsQuery.error ?? indexQuery.error ?? pricesQuery.error
  if (error) {
    return (
      <PageState
        kind="error"
        title="Could not load trading signals"
        error={error}
        retrying={signalsQuery.isFetching || indexQuery.isFetching}
        onRetry={() => {
          void signalsQuery.refetch()
          void indexQuery.refetch()
          void pricesQuery.refetch()
        }}
      />
    )
  }
  if (signalsQuery.isPending || indexQuery.isPending) {
    return <PageState kind="loading" skeleton="table" />
  }
  if (signals.length === 0) {
    return (
      <PageState
        kind="empty"
        icon={<Radar />}
        title="No trading signals yet"
        message="The daily snapshot writes one when a bank crosses the short-entry, short-exit or watch threshold."
      />
    )
  }

  const pricesLoading = pricesQuery.isPending

  const columns: Column<SignalRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (row) => row.signal.created_at,
      defaultDir: 'desc',
      render: (row) => (
        <span
          className="tabular-nums"
          title={formatDateTimeUTC(row.signal.created_at, { withDate: true })}
        >
          {formatDate(row.signal.created_at)}
        </span>
      ),
    },
    {
      key: 'bank',
      header: 'Bank',
      mobileRole: 'primary',
      sortValue: (row) => row.institution?.name ?? null,
      render: (row) => (
        <BankCell
          institution={row.institution}
          loading={indexQuery.isPending}
        />
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortValue: (row) => tradingSignalLabel(row.signal.signal_type),
      render: (row) => (
        <Badge
          tone={tradingSignalTone(row.signal.signal_type)}
          title={row.signal.reason}
        >
          {tradingSignalLabel(row.signal.signal_type)}
        </Badge>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      label: 'Score at signal',
      numeric: true,
      sortValue: (row) => row.signal.score_at_signal,
      render: (row) => <ScoreValue score={row.signal.score_at_signal} />,
    },
    {
      key: 'price',
      header: 'Price',
      label: 'Price at signal',
      numeric: true,
      hideBelow: 'md',
      sortValue: (row) => row.signal.price_at_signal,
      render: (row) =>
        row.signal.price_at_signal === null ? (
          <span className="text-muted">{EM_DASH}</span>
        ) : (
          formatCurrency(row.signal.price_at_signal, { signed: false })
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => STATUS_RANK[row.outcome.status],
      defaultDir: 'asc',
      render: (row) => <StatusBadge status={row.outcome.status} />,
    },
    {
      key: 'return',
      header: 'Return',
      label: 'Return since signal',
      numeric: true,
      sortValue: (row) => row.outcome.returnPct,
      render: (row) => {
        const { outcome } = row
        if (outcome.status === 'open' && pricesLoading)
          return <Skeleton inline className="h-4 w-12" />
        if (outcome.returnPct === null)
          return (
            <span
              className="text-muted"
              title={
                outcome.status === 'n/a'
                  ? 'Only short entries carry a return'
                  : 'A price is missing for this signal'
              }
            >
              n/a
            </span>
          )
        return (
          <span
            title={
              outcome.markSource === 'exit'
                ? `Measured at the short-exit price ${formatCurrency(outcome.markPrice, { signed: false })}`
                : `Measured at the latest price ${formatCurrency(outcome.markPrice, { signed: false })}${row.latest ? ` (${formatDate(row.latest.date)})` : ''}`
            }
          >
            <Delta value={outcome.returnPct} suffix="%" />
          </span>
        )
      },
    },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      label: 'Action',
      align: 'right',
      className: 'md:w-px whitespace-nowrap',
      render: (row) =>
        row.outcome.status === 'open' ? (
          <ButtonLink
            size="sm"
            variant="ghost"
            to={{
              search: openPositionSearch(
                row.signal.institution_id,
                'short',
                row.latest?.price ?? row.signal.price_at_signal,
              ),
            }}
          >
            Open position
          </ButtonLink>
        ) : null,
    },
  ]

  const toolbar = (
    <>
      <SegmentedControl
        aria-label="Signal status"
        size="sm"
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />
      <span className="inline-flex items-center gap-2">
        <label htmlFor={typeId} className="text-xs text-muted">
          Type
        </label>
        <Select
          id={typeId}
          value={type}
          onChange={(event) => setType(event.target.value as TypeFilter)}
          className="max-w-40 py-1 text-xs"
        >
          <option value="all">All types</option>
          {TYPE_KEYS.map((key) => (
            <option key={key} value={key}>
              {tradingSignalLabel(key)}
            </option>
          ))}
        </Select>
      </span>
      {hiddenInactive > 0 ? (
        <Checkbox
          id={inactiveId}
          label={
            <span className="text-xs text-muted">
              Show inactive ({hiddenInactive})
            </span>
          }
          checked={showInactive}
          onChange={(event) => setShowInactive(event.target.checked)}
        />
      ) : null}
    </>
  )

  return (
    <Card
      title="Signals"
      count={`${rows.length} of ${signals.length}`}
      padded={false}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.signal.id}
        defaultSort={{ key: 'date', dir: 'desc' }}
        rowTo={(row) => `/institution/${row.signal.institution_id}`}
        toolbar={toolbar}
        caption="Trading signals with derived status and return since signal"
        emptyState={
          <EmptyState
            icon={<Radar />}
            title="No signals match these filters"
            body={
              status === 'open'
                ? 'No short entry is open: every short entry has a later short exit. Switch to Closed or All.'
                : 'Change the status or type filter, or show inactive banks.'
            }
          />
        }
      />
    </Card>
  )
}
