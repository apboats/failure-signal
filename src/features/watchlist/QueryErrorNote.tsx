import { CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import type { SecondaryStatus } from './useWatchlistData'

export interface QueryErrorNoteProps {
  /** What failed, e.g. "Scores" or "Snapshots". */
  source: string
  status: SecondaryStatus
}

/**
 * Inline, card-level failure for a secondary query: the card stays on screen
 * with its other data and this row says what is missing, with a Retry.
 */
export function QueryErrorNote({ source, status }: QueryErrorNoteProps) {
  if (!status.error) return null
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm md:px-5"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-neg" />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-text">{source} failed to load.</span>{' '}
        <span className="break-words text-muted">{status.error.message}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={status.refetch}
        loading={status.isFetching}
      >
        Retry
      </Button>
    </div>
  )
}
