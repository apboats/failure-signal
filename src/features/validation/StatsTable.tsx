import type { ReactNode } from 'react'
import {
  Badge,
  Card,
  cx,
  DataTable,
  Delta,
  EmptyState,
  type Column,
} from '@/components/ui'
import {
  MIN_EVENTS_PER_HORIZON,
  type HorizonStats,
} from '@/domain/analytics/eventStudy'
import { EM_DASH, formatCount, formatPct } from '@/lib/format'

export interface StatsTableProps {
  stats: readonly HorizonStats[]
  benchmarkTicker: string
}

const dash = <span className="text-muted">{EM_DASH}</span>

const pct0 = (value: number) => `${Math.round(value)}%`

/** Valence-coloured excess, or plain muted text when the row is insufficient. */
function excess(row: HorizonStats, value: number | null): ReactNode {
  if (value === null) return dash
  if (row.insufficient)
    return <span className="text-muted tabular-nums">{formatPct(value)}</span>
  return <Delta value={value} suffix="%" positiveIsBad />
}

const columns: readonly Column<HorizonStats>[] = [
  {
    key: 'horizon',
    header: 'Horizon',
    mobileRole: 'primary',
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-medium tabular-nums">{row.horizon}d</span>
        {row.insufficient ? (
          <Badge tone="neutral" size="sm">
            insufficient
          </Badge>
        ) : null}
      </span>
    ),
  },
  {
    key: 'n',
    header: 'n',
    label: 'Events',
    numeric: true,
    render: (row) => (
      <span className={cx(row.insufficient && 'text-muted')}>
        {formatCount(row.n)}{' '}
        <span className="text-muted">of {formatCount(row.total)}</span>
      </span>
    ),
  },
  {
    key: 'hit',
    header: 'Hit rate',
    numeric: true,
    render: (row) =>
      row.hitRate === null ? (
        dash
      ) : (
        <span className={cx(row.insufficient && 'text-muted')}>
          {pct0(row.hitRate)}{' '}
          <span className="text-muted">
            ({row.hits}/{row.nonTies}
            {row.hitCI
              ? `, CI ${Math.round(row.hitCI.lower)}–${Math.round(row.hitCI.upper)}%`
              : ''}
            )
          </span>
        </span>
      ),
  },
  {
    key: 'base',
    header: 'Baseline hit',
    numeric: true,
    hideBelow: 'md',
    render: (row) =>
      row.baseHitRate === null ? (
        dash
      ) : (
        <span>
          {pct0(row.baseHitRate)}{' '}
          <span className="text-muted">
            (n = {formatCount(row.baseNonTies)})
          </span>
        </span>
      ),
  },
  {
    key: 'avg',
    header: 'Avg excess ± SE',
    numeric: true,
    render: (row) =>
      row.avgExcess === null ? (
        dash
      ) : (
        <span className="inline-flex items-baseline gap-1">
          {excess(row, row.avgExcess)}
          <span className="text-muted">
            ± {row.se === null ? EM_DASH : `${row.se.toFixed(2)}%`}
          </span>
        </span>
      ),
  },
  {
    key: 'median',
    header: 'Median',
    numeric: true,
    hideBelow: 'lg',
    render: (row) => excess(row, row.median),
  },
  {
    key: 'best',
    header: 'Best (short)',
    numeric: true,
    render: (row) => excess(row, row.bestExcess),
  },
  {
    key: 'worst',
    header: 'Worst (short)',
    numeric: true,
    render: (row) => excess(row, row.worstExcess),
  },
]

/**
 * One row per horizon. Rows with fewer than MIN_EVENTS_PER_HORIZON events are
 * greyed and labelled "insufficient" instead of printing a mean over three
 * events. Best is the most negative excess (green for a short), Worst the most
 * positive (red).
 */
export function StatsTable({ stats, benchmarkTicker }: StatsTableProps) {
  return (
    <Card
      title={`Excess return vs ${benchmarkTicker} by horizon`}
      padded={false}
    >
      <DataTable
        columns={columns}
        rows={stats}
        rowKey={(row) => String(row.horizon)}
        caption={`Event-study statistics per horizon; rows with fewer than ${MIN_EVENTS_PER_HORIZON} events are marked insufficient`}
        emptyState={
          <EmptyState
            title="No horizons to report."
            body="Horizons are fixed at 1, 5, 10 and 20 trading days."
          />
        }
      />
    </Card>
  )
}
