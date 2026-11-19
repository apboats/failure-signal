import { useMemo } from 'react'
import { Sparkline } from '@/components/charts/Sparkline'
import {
  Card,
  Delta,
  EmptyState,
  ListRow,
  ListRows,
  ScoreValue,
  Skeleton,
} from '@/components/ui'
import { EM_DASH } from '@/lib/format'
import { QueryErrorNote } from './QueryErrorNote'
import {
  MOVERS_LIMIT,
  topMovers,
  type SecondaryStatus,
  type WatchlistRow,
} from './useWatchlistData'

export interface MoversCardProps {
  /** Active banks only. */
  rows: readonly WatchlistRow[]
  status: {
    scores: SecondaryStatus
    snapshots: SecondaryStatus
  }
}

function SkeletonRows() {
  return (
    <ListRows>
      {Array.from({ length: MOVERS_LIMIT }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 md:px-5">
          <span className="min-w-0 flex-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </span>
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-5 w-18" />
        </li>
      ))}
    </ListRows>
  )
}

/** Top movers by Δ24h with score, delta and a 30-day sparkline per row. */
export function MoversCard({ rows, status }: MoversCardProps) {
  const movers = useMemo(() => topMovers(rows), [rows])
  const loading = status.scores.isPending || status.snapshots.isPending
  const failed = Boolean(status.scores.error || status.snapshots.error)

  return (
    <Card
      title="Movers"
      padded={false}
      action={
        <span className="text-xs text-muted">Δ24h vs yesterday's snapshot</span>
      }
    >
      <QueryErrorNote source="Scores" status={status.scores} />
      <QueryErrorNote source="Snapshots" status={status.snapshots} />
      {loading && !failed ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading movers</span>
          <SkeletonRows />
        </div>
      ) : movers.length === 0 ? (
        failed ? null : (
          <EmptyState
            title="No movers yet"
            body="A move needs today's score and yesterday's daily snapshot for the same bank."
          />
        )
      ) : (
        <ListRows>
          {movers.map((row) => (
            <ListRow
              key={row.id}
              to={`/institution/${row.id}`}
              title={
                <span className="font-medium">{row.ticker ?? EM_DASH}</span>
              }
              meta={<span className="block truncate">{row.name}</span>}
              trailing={
                <>
                  <span className="w-10 text-right">
                    <ScoreValue score={row.score} />
                  </span>
                  <span className="w-12 text-right text-sm">
                    <Delta value={row.d24} digits={1} positiveIsBad />
                  </span>
                  <Sparkline points={row.sparkline} width={72} height={20} />
                </>
              }
            />
          ))}
        </ListRows>
      )}
    </Card>
  )
}
