import { useId, useMemo, useState, type ReactNode } from 'react'
import { Sparkline } from '@/components/charts/Sparkline'
import {
  Badge,
  Card,
  Checkbox,
  cx,
  DataTable,
  Delta,
  EmptyState,
  ScoreValue,
  Select,
  Skeleton,
  type Column,
} from '@/components/ui'
import {
  EM_DASH,
  formatCount,
  formatCurrency,
  formatRelative,
} from '@/lib/format'
import { WATCH } from '@shared/thresholds'
import { QueryErrorNote } from './QueryErrorNote'
import {
  matchesSearch,
  matchesTile,
  sectorLabel,
  SPARKLINE_DAYS,
  STALE_SCORE_MS,
  type SecondaryStatus,
  type TileFilter,
  type WatchlistRow,
} from './useWatchlistData'

export interface InstitutionTableProps {
  /** Every institution; inactive ones are hidden until the checkbox is on. */
  rows: readonly WatchlistRow[]
  search: string
  tile: TileFilter | null
  status: {
    scores: SecondaryStatus
    snapshots: SecondaryStatus
    signals: SecondaryStatus
    trading: SecondaryStatus
  }
  now: number
}

const ALL_SECTORS = 'all'

const TILE_EMPTY: Record<TileFilter, string> = {
  scored: 'No bank has a score in the latest scoring window.',
  elevated: `No active bank scores ${WATCH} or above right now.`,
  signals24h: 'No bank has a risk signal dated in the last 24 h.',
  trade: 'No bank has an active short-entry or watch signal.',
}

function cell(
  status: SecondaryStatus,
  width: string,
  content: () => ReactNode,
) {
  if (status.isPending) return <Skeleton inline className={cx('h-4', width)} />
  return content()
}

/**
 * All banks as a sortable table: score, 30-day sparkline, Δ24h / Δ7d against
 * the daily snapshots, signals in 7 d, latest price and how long ago the bank
 * was scored. Default order is score descending with unscored banks last.
 */
export function InstitutionTable({
  rows,
  search,
  tile,
  status,
  now,
}: InstitutionTableProps) {
  const [sector, setSector] = useState<string>(ALL_SECTORS)
  const [showInactive, setShowInactive] = useState(false)
  const sectorId = useId()
  const inactiveId = useId()

  const sectors = useMemo(
    () => [...new Set(rows.map((row) => row.sector))].sort(),
    [rows],
  )

  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (showInactive || row.isActive) &&
          (sector === ALL_SECTORS || row.sector === sector) &&
          matchesTile(row, tile) &&
          matchesSearch(row, search),
      ),
    [rows, showInactive, sector, tile, search],
  )
  const total = useMemo(
    () => rows.filter((row) => showInactive || row.isActive).length,
    [rows, showInactive],
  )

  const columns = useMemo<Column<WatchlistRow>[]>(() => {
    const nowDate = new Date(now)
    return [
      {
        key: 'ticker',
        header: 'Ticker',
        mobileRole: 'primary',
        sortValue: (row) => row.ticker ?? row.name,
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <span>{row.ticker ?? EM_DASH}</span>
            <span className="truncate text-xs font-normal text-muted md:hidden">
              {row.name}
            </span>
            {row.isActive ? null : (
              <Badge size="sm" tone="neutral">
                Inactive
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        hideBelow: 'md',
        sortValue: (row) => row.name,
        render: (row) => (
          <span className="block max-w-44 truncate" title={row.name}>
            {row.name}
          </span>
        ),
      },
      {
        key: 'sector',
        header: 'Sector',
        hideBelow: 'lg',
        // DataTable's mobile collapse (max-md:flex) outranks max-lg:hidden in the cascade; keep it hidden below md too.
        className: 'max-md:hidden!',
        sortValue: (row) => row.sector,
        render: (row) => (
          <span className="whitespace-nowrap text-muted">
            {sectorLabel(row.sector)}
          </span>
        ),
      },
      {
        key: 'score',
        header: 'Score',
        numeric: true,
        sortValue: (row) => row.score,
        render: (row) =>
          cell(status.scores, 'w-8', () => <ScoreValue score={row.score} />),
      },
      {
        key: 'sparkline',
        header: `${SPARKLINE_DAYS}d`,
        label: `${SPARKLINE_DAYS}-day trend`,
        align: 'right',
        className: 'md:w-24',
        render: (row) =>
          cell(status.snapshots, 'w-18', () => (
            <Sparkline points={row.sparkline} width={72} height={24} />
          )),
      },
      {
        key: 'd24',
        header: 'Δ24h',
        numeric: true,
        sortValue: (row) => row.d24,
        render: (row) =>
          cell(status.snapshots, 'w-10', () => (
            <Delta value={row.d24} digits={1} positiveIsBad />
          )),
      },
      {
        key: 'd7',
        header: 'Δ7d',
        numeric: true,
        hideBelow: 'sm',
        sortValue: (row) => row.d7,
        render: (row) =>
          cell(status.snapshots, 'w-10', () => (
            <Delta value={row.d7} digits={1} positiveIsBad />
          )),
      },
      {
        key: 'signals7d',
        header: 'Signals 7d',
        numeric: true,
        hideBelow: 'md',
        sortValue: (row) => row.signals7d,
        render: (row) =>
          cell(status.signals, 'w-6', () =>
            row.signals7d === 0 ? (
              <span className="text-muted">0</span>
            ) : (
              formatCount(row.signals7d)
            ),
          ),
      },
      {
        key: 'price',
        header: 'Price',
        numeric: true,
        sortValue: (row) => row.price,
        render: (row) =>
          cell(status.snapshots, 'w-20', () =>
            row.price === null ? (
              <span className="text-muted">{EM_DASH}</span>
            ) : (
              <span className="inline-flex items-baseline gap-1.5">
                <span>{formatCurrency(row.price, { signed: false })}</span>
                <Delta
                  value={row.priceChangePct}
                  digits={2}
                  suffix="%"
                  className="text-xs"
                />
              </span>
            ),
          ),
      },
      {
        key: 'scoredAt',
        header: 'Scored',
        label: 'Last scored',
        align: 'right',
        hideBelow: 'md',
        sortValue: (row) =>
          row.computedAt ? Date.parse(row.computedAt) : null,
        render: (row) =>
          cell(status.scores, 'w-14', () => {
            if (!row.computedAt)
              return <span className="text-muted">{EM_DASH}</span>
            const stale = now - Date.parse(row.computedAt) > STALE_SCORE_MS
            return (
              <span
                className={cx(
                  'whitespace-nowrap tabular-nums',
                  stale ? 'text-sev-medium' : 'text-muted',
                )}
                title={
                  stale ? 'More than 2 h since this bank was scored' : undefined
                }
              >
                {formatRelative(row.computedAt, nowDate)}
              </span>
            )
          }),
      },
    ]
  }, [status.scores, status.snapshots, status.signals, now])

  const emptyBody =
    tile !== null
      ? TILE_EMPTY[tile]
      : search.trim() !== ''
        ? `Nothing matches "${search.trim()}". Try a ticker such as JPM or part of a name.`
        : sector !== ALL_SECTORS
          ? `No ${showInactive ? '' : 'active '}bank in ${sectorLabel(sector).toLowerCase()}.`
          : 'No active banks. Turn on "Show inactive" to see the rest.'

  return (
    <Card title="Banks" count={visible.length} padded={false}>
      <QueryErrorNote source="Scores" status={status.scores} />
      <QueryErrorNote source="Snapshots" status={status.snapshots} />
      <QueryErrorNote source="Signals" status={status.signals} />
      <QueryErrorNote source="Trading signals" status={status.trading} />
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(row) => row.id}
        defaultSort={{ key: 'score', dir: 'desc' }}
        rowTo={(row) => `/institution/${row.id}`}
        caption="Monitored banks by risk score"
        maxHeight="md:max-h-[70vh]"
        toolbar={
          <>
            <label htmlFor={sectorId} className="text-xs text-muted">
              Sector
            </label>
            <Select
              id={sectorId}
              value={sector}
              onChange={(event) => setSector(event.target.value)}
              className="max-w-44"
            >
              <option value={ALL_SECTORS}>All sectors</option>
              {sectors.map((value) => (
                <option key={value} value={value}>
                  {sectorLabel(value)}
                </option>
              ))}
            </Select>
            <Checkbox
              id={inactiveId}
              label="Show inactive"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="text-xs"
            />
            <span className="text-xs text-muted tabular-nums">
              {formatCount(visible.length)} of {formatCount(total)}
            </span>
          </>
        }
        emptyState={<EmptyState title="No banks match" body={emptyBody} />}
      />
    </Card>
  )
}
