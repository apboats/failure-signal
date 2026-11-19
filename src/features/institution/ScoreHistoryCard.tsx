import { useMemo, useState } from 'react'
import { ScoreChart, type ScoreRange } from '@/components/charts/ScoreChart'
import {
  Card,
  EmptyState,
  PageState,
  SegmentedControl,
  Skeleton,
} from '@/components/ui'
import { useScoreHistory } from '@/queries/useScoreHistory'
import { describeWindow, withLatestPoint, type LatestPoint } from './history'

export interface ScoreHistoryCardProps {
  institutionId: string
  /** Newest hourly score, appended as today's point; undefined while it loads. */
  latest: LatestPoint | undefined
}

const RANGES = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
] as const satisfies readonly { value: ScoreRange; label: string }[]

const DAYS: Record<ScoreRange, number | 'all'> = {
  '30d': 30,
  '90d': 90,
  all: 'all',
}

const CHART_HEIGHT = 240

/** Daily snapshots for the bank over 30d / 90d / all, ending at today's hourly score. */
export function ScoreHistoryCard({
  institutionId,
  latest,
}: ScoreHistoryCardProps) {
  const [range, setRange] = useState<ScoreRange>('30d')
  const history = useScoreHistory(institutionId, DAYS[range])
  const snapshots = history.data
  const points = useMemo(
    () => withLatestPoint(snapshots ?? [], latest),
    [snapshots, latest],
  )

  if (history.isError)
    return (
      <PageState
        kind="error"
        title="Could not load score history"
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    )

  return (
    <Card
      title="Score history"
      action={
        <SegmentedControl
          aria-label="Score history range"
          size="sm"
          options={RANGES}
          value={range}
          onChange={setRange}
        />
      }
    >
      {history.isPending ? (
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading score history</span>
          <Skeleton className="w-full" />
          <Skeleton
            className="mt-3 w-full"
            // The chart's height, so the card does not jump when the line arrives.
          />
          <div style={{ height: CHART_HEIGHT - 28 }} className="mt-3">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      ) : !snapshots || snapshots.length === 0 ? (
        <EmptyState
          title="No daily snapshots yet for this bank"
          body={
            range === 'all'
              ? 'The daily snapshot job writes one point per bank at 22:00 UTC.'
              : 'Try a wider range.'
          }
        />
      ) : (
        <>
          <ScoreChart points={points} range={range} height={CHART_HEIGHT} />
          <p className="mt-3 text-xs text-muted tabular-nums">
            {describeWindow(points)}
          </p>
        </>
      )}
    </Card>
  )
}
