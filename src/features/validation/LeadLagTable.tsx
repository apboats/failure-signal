import {
  Card,
  cx,
  DataTable,
  EmptyState,
  ScoreValue,
  type Column,
} from '@/components/ui'
import { MIN_HIGH_DAYS, type LeadLagRow } from '@/domain/analytics/leadLag'
import { EM_DASH, formatCount } from '@/lib/format'

export interface LeadLagTableRow extends LeadLagRow {
  name: string
  ticker: string | null
}

export interface LeadLagTableProps {
  rows: readonly LeadLagTableRow[]
  lagDays: number
  selectedId: string | null
  onSelect: (institutionId: string) => void
}

const dash = <span className="text-muted">{EM_DASH}</span>

/** "54% (7/13)" over "CI 29–77%", greyed below MIN_HIGH_DAYS high days, '—' with none. */
function DropCell({ row }: { row: LeadLagTableRow }) {
  if (row.highDays === 0 || row.dropRate === null) return dash
  const weak = row.highDays < MIN_HIGH_DAYS
  return (
    <span
      className={cx(
        'inline-flex flex-col items-start leading-tight md:items-end',
        weak && 'text-muted',
      )}
    >
      <span>
        {Math.round(row.dropRate)}%{' '}
        <span className="text-muted">
          ({row.dropsAfterHigh}/{row.highDays})
        </span>
      </span>
      <span className="text-xs text-muted">
        {row.dropCI
          ? `CI ${Math.round(row.dropCI.lower)}–${Math.round(row.dropCI.upper)}%`
          : EM_DASH}
        {weak ? ` · under ${MIN_HIGH_DAYS} high days` : ''}
      </span>
    </span>
  )
}

const columns: readonly Column<LeadLagTableRow>[] = [
  {
    key: 'bank',
    header: 'Bank',
    mobileRole: 'primary',
    sortValue: (row) => row.ticker ?? row.name,
    render: (row) => (
      <>
        <span className="font-medium">{row.ticker ?? row.name}</span>
        {row.ticker ? (
          <span className="ml-1.5 text-xs font-normal text-muted">
            {row.name}
          </span>
        ) : null}
      </>
    ),
  },
  {
    key: 'days',
    header: 'Days',
    label: 'Trading days',
    numeric: true,
    sortValue: (row) => row.days,
    render: (row) => formatCount(row.days),
  },
  {
    key: 'threshold',
    header: 'High score ≥',
    label: 'High-score threshold',
    numeric: true,
    hideBelow: 'lg',
    sortValue: (row) => row.threshold,
    render: (row) => <ScoreValue score={row.threshold} />,
  },
  {
    key: 'drop',
    header: 'High score → drop',
    label: 'High score to drop',
    numeric: true,
    sortValue: (row) => row.dropRate,
    render: (row) => <DropCell row={row} />,
  },
  {
    key: 'rho',
    header: 'ρ (Spearman)',
    label: 'Spearman rho',
    numeric: true,
    sortValue: (row) => row.rho,
    render: (row) =>
      row.rho === null ? (
        dash
      ) : (
        <span>
          {row.rho.toFixed(2)}{' '}
          <span className="text-muted">n = {formatCount(row.rhoN)}</span>
        </span>
      ),
  },
  {
    key: 'avgDrop',
    header: 'Avg score before drop',
    numeric: true,
    hideBelow: 'lg',
    sortValue: (row) => row.avgScoreBeforeDrop,
    render: (row) => <ScoreValue score={row.avgScoreBeforeDrop} />,
  },
  {
    key: 'avgRise',
    header: 'Avg score before rise',
    numeric: true,
    hideBelow: 'lg',
    sortValue: (row) => row.avgScoreBeforeRise,
    render: (row) => <ScoreValue score={row.avgScoreBeforeRise} />,
  },
]

/**
 * One row per bank with enough observations. The key column
 * "High score → drop" has no breakpoint so it is always visible; the bank
 * cell is a button with aria-pressed that selects the row for the chart.
 */
export function LeadLagTable({
  rows,
  lagDays,
  selectedId,
  onSelect,
}: LeadLagTableProps) {
  return (
    <Card
      title="Banks"
      count={`${formatCount(rows.length)} · lag ${lagDays} trading ${lagDays === 1 ? 'day' : 'days'}`}
      padded={false}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.institutionId}
        defaultSort={{ key: 'days', dir: 'desc' }}
        onRowClick={(row) => onSelect(row.institutionId)}
        rowSelected={(row) => row.institutionId === selectedId}
        caption={`Lead-lag statistics per bank at a lag of ${lagDays} trading days; select a bank to chart it`}
        emptyState={
          <EmptyState
            title="No bank has enough observations."
            body="Lower the minimum or widen the range."
          />
        }
      />
    </Card>
  )
}
