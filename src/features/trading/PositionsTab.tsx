import { Briefcase, Plus } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  DataTable,
  Delta,
  DirectionBadge,
  EmptyState,
  PageState,
  Skeleton,
  StatTile,
  type Column,
} from '@/components/ui'
import {
  pnlOf,
  pnlPct,
  summarizeClosed,
  unrealisedOf,
  type UnrealisedPnl,
} from '@/domain/pnl'
import { EM_DASH, formatCount, formatCurrency, formatDate } from '@/lib/format'
import {
  useActiveInstitutions,
  useInstitutionIndex,
} from '@/queries/useInstitutions'
import { useLatestPrices } from '@/queries/useLatestPrices'
import { usePositions } from '@/queries/usePositions'
import type { Institution, LatestPrice, Position } from '@shared/types'
import { BankCell } from './BankCell'
import { bankLabel } from './bankLabel'
import { ClosePositionRow } from './ClosePositionRow'
import { PnlCurrency } from './PnlCurrency'
import { PositionForm } from './PositionForm'
import { readPositionPrefill, withoutPrefill } from './prefill'

interface OpenRow {
  position: Position
  institution: Institution | undefined
  latest: LatestPrice | undefined
  unrealised: UnrealisedPnl | null
}

interface ClosedRow {
  position: Position
  institution: Institution | undefined
  pnl: number | null
  pct: number | null
}

const EMPTY_POSITIONS: readonly Position[] = []
const EMPTY_PRICES: ReadonlyMap<string, LatestPrice> = new Map()

function toneOf(value: number | null): 'pos' | 'neg' | undefined {
  if (value === null) return undefined
  const rounded = Math.round(value * 100) / 100
  if (rounded > 0) return 'pos'
  if (rounded < 0) return 'neg'
  return undefined
}

/** "as of Nov 17, 2026", or the span when the open positions were priced on different days. */
function asOfLabel(dates: readonly string[]): string | null {
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  return first === last
    ? `as of ${formatDate(first)}`
    : `as of ${formatDate(first)} – ${formatDate(last)}`
}

/**
 * Positions tab: realised / unrealised / total P&L and win rate tiles, the
 * open book marked to the latest priced snapshot, the closed book with
 * realised P&L, a New position form and an inline close confirm.
 */
export function PositionsTab() {
  const positionsQuery = usePositions()
  const indexQuery = useInstitutionIndex()
  const activeQuery = useActiveInstitutions()
  const [searchParams, setSearchParams] = useSearchParams()
  const prefill = useMemo(
    () => readPositionPrefill(searchParams),
    [searchParams],
  )
  const prefillKey = `${prefill.institutionId ?? ''}|${prefill.direction ?? ''}|${prefill.price ?? ''}`

  const positions = positionsQuery.data ?? EMPTY_POSITIONS
  const open = useMemo(
    () => positions.filter((position) => position.is_open),
    [positions],
  )
  const closed = useMemo(
    () => positions.filter((position) => !position.is_open),
    [positions],
  )
  const openIds = useMemo(
    () => [...new Set(open.map((position) => position.institution_id))].sort(),
    [open],
  )
  const pricesQuery = useLatestPrices(openIds)
  const prices = pricesQuery.data ?? EMPTY_PRICES
  const index = indexQuery.data

  const [showForm, setShowForm] = useState(
    () => prefill.institutionId !== undefined,
  )
  const [closingId, setClosingId] = useState<string | null>(null)
  const formId = useId()
  const closePanelId = useId()

  const openRows = useMemo<OpenRow[]>(
    () =>
      open.map((position) => {
        const latest = prices.get(position.institution_id)
        return {
          position,
          institution: index.get(position.institution_id),
          latest,
          unrealised: unrealisedOf(position, latest?.price ?? null),
        }
      }),
    [open, prices, index],
  )
  const closedRows = useMemo<ClosedRow[]>(
    () =>
      closed.map((position) => ({
        position,
        institution: index.get(position.institution_id),
        pnl: pnlOf(position),
        pct: pnlPct(position),
      })),
    [closed, index],
  )

  const summary = useMemo(() => summarizeClosed(closed), [closed])
  const unrealised = useMemo(() => {
    const priced = openRows.filter((row) => row.unrealised !== null)
    if (priced.length === 0) return { total: null, asOf: null, count: 0 }
    return {
      total: priced.reduce((sum, row) => sum + (row.unrealised?.pnl ?? 0), 0),
      asOf: asOfLabel(priced.map((row) => row.latest?.date ?? '')),
      count: priced.length,
    }
  }, [openRows])
  const total =
    summary.realised === null && unrealised.total === null
      ? null
      : (summary.realised ?? 0) + (unrealised.total ?? 0)

  const error =
    positionsQuery.error ??
    indexQuery.error ??
    activeQuery.error ??
    pricesQuery.error
  if (error) {
    return (
      <PageState
        kind="error"
        title="Could not load positions"
        error={error}
        retrying={positionsQuery.isFetching || indexQuery.isFetching}
        onRetry={() => {
          void positionsQuery.refetch()
          void indexQuery.refetch()
          void pricesQuery.refetch()
        }}
      />
    )
  }
  if (positionsQuery.isPending || indexQuery.isPending) {
    return (
      <>
        <PageState kind="loading" skeleton="tiles" />
        <PageState kind="loading" skeleton="table" />
      </>
    )
  }

  const pricesLoading = pricesQuery.isPending && openIds.length > 0
  const closing = closingId
    ? open.find((position) => position.id === closingId)
    : undefined

  function closeForm() {
    setShowForm(false)
    if (prefill.institutionId || prefill.direction || prefill.price) {
      setSearchParams((prev) => withoutPrefill(prev), { replace: true })
    }
  }

  const openColumns: Column<OpenRow>[] = [
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
      key: 'direction',
      header: 'Direction',
      sortValue: (row) => row.position.direction,
      render: (row) => <DirectionBadge direction={row.position.direction} />,
    },
    {
      key: 'entry',
      header: 'Entry',
      numeric: true,
      sortValue: (row) => row.position.entry_price,
      render: (row) =>
        formatCurrency(row.position.entry_price, { signed: false }),
    },
    {
      key: 'entryDate',
      header: 'Entry date',
      hideBelow: 'md',
      sortValue: (row) => row.position.entry_date,
      defaultDir: 'desc',
      render: (row) => (
        <span className="tabular-nums">
          {formatDate(row.position.entry_date)}
        </span>
      ),
    },
    {
      key: 'shares',
      header: 'Shares',
      numeric: true,
      hideBelow: 'md',
      sortValue: (row) => row.position.shares,
      render: (row) => formatCount(row.position.shares),
    },
    {
      key: 'last',
      header: 'Last',
      label: 'Last price',
      numeric: true,
      sortValue: (row) => row.latest?.price ?? null,
      render: (row) =>
        pricesLoading ? (
          <Skeleton inline className="h-4 w-14" />
        ) : row.latest ? (
          <span title={`Priced snapshot of ${formatDate(row.latest.date)}`}>
            {formatCurrency(row.latest.price, { signed: false })}
          </span>
        ) : (
          <span className="text-muted" title="No priced snapshot for this bank">
            {EM_DASH}
          </span>
        ),
    },
    {
      key: 'unrealised',
      header: 'Unrealised',
      label: 'Unrealised P&L',
      numeric: true,
      sortValue: (row) => row.unrealised?.pnl ?? null,
      render: (row) =>
        pricesLoading ? (
          <Skeleton inline className="h-4 w-16" />
        ) : (
          <PnlCurrency value={row.unrealised?.pnl ?? null} />
        ),
    },
    {
      key: 'unrealisedPct',
      header: 'Return',
      label: 'Unrealised return',
      numeric: true,
      hideBelow: 'sm',
      sortValue: (row) => row.unrealised?.pct ?? null,
      render: (row) =>
        pricesLoading ? (
          <Skeleton inline className="h-4 w-12" />
        ) : (
          <Delta value={row.unrealised?.pct ?? null} suffix="%" />
        ),
    },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      label: 'Action',
      align: 'right',
      className: 'md:w-px whitespace-nowrap',
      render: (row) => (
        <Button
          size="sm"
          variant={closingId === row.position.id ? 'secondary' : 'ghost'}
          aria-expanded={closingId === row.position.id}
          aria-controls={closePanelId}
          onClick={() =>
            setClosingId((current) =>
              current === row.position.id ? null : row.position.id,
            )
          }
        >
          Close
        </Button>
      ),
    },
  ]

  const closedColumns: Column<ClosedRow>[] = [
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
      key: 'direction',
      header: 'Direction',
      sortValue: (row) => row.position.direction,
      render: (row) => <DirectionBadge direction={row.position.direction} />,
    },
    {
      key: 'prices',
      header: 'Entry → Exit',
      numeric: true,
      sortValue: (row) => row.position.entry_price,
      render: (row) => (
        <span className="tabular-nums">
          {formatCurrency(row.position.entry_price, { signed: false })} →{' '}
          {row.position.exit_price === null ? (
            <span className="text-muted">{EM_DASH}</span>
          ) : (
            formatCurrency(row.position.exit_price, { signed: false })
          )}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      hideBelow: 'lg',
      sortValue: (row) => row.position.exit_date ?? row.position.entry_date,
      defaultDir: 'desc',
      render: (row) => (
        <span className="tabular-nums">
          {formatDate(row.position.entry_date)} →{' '}
          {formatDate(row.position.exit_date)}
        </span>
      ),
    },
    {
      key: 'shares',
      header: 'Shares',
      numeric: true,
      hideBelow: 'md',
      sortValue: (row) => row.position.shares,
      render: (row) => formatCount(row.position.shares),
    },
    {
      key: 'pnl',
      header: 'Realised',
      label: 'Realised P&L',
      numeric: true,
      sortValue: (row) => row.pnl,
      render: (row) => <PnlCurrency value={row.pnl} />,
    },
    {
      key: 'pct',
      header: 'Return',
      label: 'Return on notional',
      numeric: true,
      sortValue: (row) => row.pct,
      render: (row) => <Delta value={row.pct} suffix="%" />,
    },
    {
      key: 'notes',
      header: 'Notes',
      hideBelow: 'lg',
      render: (row) =>
        row.position.notes ? (
          <span
            className="block max-w-56 truncate text-xs text-muted"
            title={row.position.notes}
          >
            {row.position.notes}
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Realised P&L"
          value={
            summary.realised === null ? null : formatCurrency(summary.realised)
          }
          tone={toneOf(summary.realised)}
          sub={
            summary.settledCount > 0
              ? `${formatCount(summary.settledCount)} closed`
              : 'No closed positions'
          }
        />
        <StatTile
          label="Unrealised P&L"
          value={
            pricesLoading ? (
              <Skeleton inline className="h-7 w-24" />
            ) : unrealised.total === null ? null : (
              formatCurrency(unrealised.total)
            )
          }
          tone={toneOf(unrealised.total)}
          sub={
            pricesLoading
              ? 'Loading latest prices'
              : (unrealised.asOf ??
                (open.length === 0
                  ? 'No open positions'
                  : 'No priced snapshot for the open banks'))
          }
        />
        <StatTile
          label="Total P&L"
          value={
            pricesLoading ? (
              <Skeleton inline className="h-7 w-24" />
            ) : total === null ? null : (
              formatCurrency(total)
            )
          }
          tone={toneOf(total)}
          sub="Realised + unrealised"
        />
        <StatTile
          label="Win rate"
          value={
            summary.winRate === null ? null : `${summary.winRate.toFixed(0)}%`
          }
          sub={
            summary.settledCount > 0
              ? `${formatCount(summary.wins)} of ${formatCount(summary.settledCount)} closed · breakeven is not a win`
              : 'No closed positions'
          }
        />
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Plus />}
          aria-expanded={showForm}
          aria-controls={formId}
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
        >
          New position
        </Button>
      </div>

      {showForm ? (
        <div id={formId}>
          <PositionForm
            key={prefillKey}
            prefill={prefill}
            institutions={activeQuery.data}
            onDone={closeForm}
            onCancel={closeForm}
          />
        </div>
      ) : null}

      <Card title="Open positions" count={open.length} padded={false}>
        <DataTable
          columns={openColumns}
          rows={openRows}
          rowKey={(row) => row.position.id}
          defaultSort={{ key: 'entryDate', dir: 'desc' }}
          rowTo={(row) => `/institution/${row.position.institution_id}`}
          rowSelected={(row) => row.position.id === closingId}
          caption="Open positions marked to the latest priced snapshot"
          emptyState={
            <EmptyState
              icon={<Briefcase />}
              title="No open positions."
              body="Open one from a trading signal."
            />
          }
        />
        {closing ? (
          <div
            id={closePanelId}
            className="border-t border-border px-4 py-4 md:px-5"
          >
            <ClosePositionRow
              key={closing.id}
              position={closing}
              bankLabel={bankLabel(index.get(closing.institution_id))}
              onDone={() => setClosingId(null)}
              onCancel={() => setClosingId(null)}
            />
          </div>
        ) : null}
      </Card>

      <Card title="Closed positions" count={closed.length} padded={false}>
        <DataTable
          columns={closedColumns}
          rows={closedRows}
          rowKey={(row) => row.position.id}
          defaultSort={{ key: 'dates', dir: 'desc' }}
          rowTo={(row) => `/institution/${row.position.institution_id}`}
          caption="Closed positions with realised P&L"
          emptyState={
            <EmptyState
              icon={<Briefcase />}
              title="No closed positions."
              body={`Closing an open position records its realised P&L here${summary.settledCount === 0 && open.length > 0 ? `; ${formatCount(open.length)} open now` : ''}.`}
            />
          }
        />
      </Card>
      <p className="text-xs text-muted">
        Returns are on notional (per-share P&L over the entry price), not on
        margin. Unrealised P&L marks each open position to its bank's newest
        priced daily snapshot{unrealised.asOf ? ` (${unrealised.asOf})` : ''}.
      </p>
    </>
  )
}
