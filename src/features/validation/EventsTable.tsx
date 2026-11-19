import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Card,
  DataTable,
  Delta,
  EmptyState,
  ScoreValue,
  type Breakpoint,
  type Column,
} from '@/components/ui'
import type { StudyEvent } from '@/domain/analytics/eventStudy'
import { formatCount, formatDate } from '@/lib/format'

export interface EventRow extends StudyEvent {
  key: string
  name: string
  ticker: string | null
}

export interface EventsTableProps {
  rows: readonly EventRow[]
  distinctDates: number
  distinctBanks: number
  horizons: readonly number[]
  /** The horizon the Hit column judges (the verdict horizon). */
  verdictHorizon: number
}

/** true = excess below zero (the short was right); null when no return or an exact tie. */
function hitAt(row: EventRow, horizon: number): boolean | null {
  const value = row.excess[horizon]
  if (value === null || value === undefined || value === 0) return null
  return value < 0
}

const HIDE: Partial<Record<number, Breakpoint>> = { 1: 'md', 10: 'lg' }

/**
 * Every event with its score, prior score and excess return per horizon.
 * The Hit column is the row's mobile headline so it is never hidden; score
 * cells go through ScoreValue and excess cells through Delta with
 * positiveIsBad (negative excess is good for a short).
 */
export function EventsTable({
  rows,
  distinctDates,
  distinctBanks,
  horizons,
  verdictHorizon,
}: EventsTableProps) {
  const columns = useMemo<Column<EventRow>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        sortValue: (row) => row.date,
        defaultDir: 'desc',
        render: (row) => formatDate(row.date),
      },
      {
        key: 'bank',
        header: 'Bank',
        sortValue: (row) => row.ticker ?? row.name,
        render: (row) => (
          <Link
            to={`/institution/${row.institutionId}`}
            className="focus-ring rounded hover:underline"
          >
            <span className="font-medium">{row.ticker ?? row.name}</span>
            {row.ticker ? (
              <span className="ml-1.5 text-xs text-muted">{row.name}</span>
            ) : null}
          </Link>
        ),
      },
      {
        key: 'score',
        header: 'Score',
        numeric: true,
        sortValue: (row) => row.score,
        render: (row) => <ScoreValue score={row.score} />,
      },
      {
        key: 'prior',
        header: 'Prior',
        label: 'Prior score',
        numeric: true,
        hideBelow: 'lg',
        sortValue: (row) => row.priorScore,
        render: (row) => <ScoreValue score={row.priorScore} />,
      },
      {
        key: 'hit',
        header: `Hit (${verdictHorizon}d)`,
        mobileRole: 'primary',
        sortValue: (row) => {
          const hit = hitAt(row, verdictHorizon)
          return hit === null ? null : hit ? 1 : 0
        },
        defaultDir: 'desc',
        render: (row) => {
          const hit = hitAt(row, verdictHorizon)
          if (hit === null) return <Badge tone="neutral">No return</Badge>
          return hit ? (
            <Badge tone="pos">Hit</Badge>
          ) : (
            <Badge tone="neg">Miss</Badge>
          )
        },
      },
      ...horizons.map((horizon): Column<EventRow> => ({
        key: `h${horizon}`,
        header: `${horizon}d`,
        label: `${horizon}d excess`,
        numeric: true,
        hideBelow: HIDE[horizon],
        sortValue: (row) => row.excess[horizon] ?? null,
        render: (row) => (
          <Delta value={row.excess[horizon]} suffix="%" positiveIsBad />
        ),
      })),
    ],
    [horizons, verdictHorizon],
  )

  return (
    <Card
      title="Events"
      count={`${formatCount(rows.length)} events · ${formatCount(distinctDates)} dates · ${formatCount(distinctBanks)} banks`}
      padded={false}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        defaultSort={{ key: 'date', dir: 'desc' }}
        maxHeight="max-h-[32rem]"
        caption="Events with excess returns per horizon in trading days"
        emptyState={
          <EmptyState
            title="No events in this window."
            body="Lower the threshold, switch to velocity or widen the range."
          />
        }
      />
    </Card>
  )
}
