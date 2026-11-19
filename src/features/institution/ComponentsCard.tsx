import type { ScoreComponents } from '@shared/types'
import { Card, PageState, Skeleton } from '@/components/ui'
import { componentEntries } from '@/domain/signals'
import { EM_DASH } from '@/lib/format'

export interface ComponentsCardProps {
  /** score_components of the newest score; null/empty when no category carries evidence. */
  components: ScoreComponents | null | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}

/**
 * Bar list of the categories that contribute to the latest score, largest
 * first. The category colour is only the dot beside the label; the bar is a
 * plain data mark scaled to the largest value.
 */
export function ComponentsCard({
  components,
  isPending,
  isError,
  error,
  onRetry,
}: ComponentsCardProps) {
  if (isError)
    return (
      <PageState
        kind="error"
        title="Could not load score components"
        error={error}
        onRetry={onRetry}
      />
    )
  const entries = componentEntries(components)
  const max = entries[0]?.value ?? 0

  return (
    <Card title="Score components">
      {isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="space-y-4"
        >
          <span className="sr-only">Loading score components</span>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <>
          <p className="text-sm text-muted tabular-nums">{EM_DASH}</p>
          <p className="mt-1 text-xs text-muted">
            No category carries evidence in the latest score.
          </p>
        </>
      ) : (
        <>
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.category}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-text">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate">{entry.label}</span>
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {entry.value.toFixed(1)}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{
                      width: `${max > 0 ? (entry.value / max) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Normalised evidence per category (0–100), before weighting.
          </p>
        </>
      )}
    </Card>
  )
}
