import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './Button'
import { cx } from './cx'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

export type PageStateKind = 'loading' | 'error' | 'empty' | 'notFound'
export type SkeletonLayout = 'tiles' | 'table' | 'card'

export interface PageStateProps {
  kind: PageStateKind
  title?: ReactNode
  /** Error: shown verbatim (defaults to error.message). Empty/notFound: the body line. */
  message?: ReactNode
  /** The thrown value from React Query; its message is rendered verbatim. */
  error?: unknown
  /** Error: wires the Retry button (pass the query's refetch). */
  onRetry?: () => void
  retrying?: boolean
  /** Loading: which skeleton shape to draw. */
  skeleton?: SkeletonLayout
  /** Empty: icon and action for the EmptyState. */
  icon?: ReactNode
  action?: ReactNode
  /** notFound: where the Back link goes ('/' by default). */
  backTo?: string
  backLabel?: string
  /** Replaces the default body of the state. */
  children?: ReactNode
  className?: string
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

const CARD = 'rounded-xl border border-border bg-surface'

function LoadingSkeleton({ layout }: { layout: SkeletonLayout }) {
  if (layout === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cx(CARD, 'p-4 md:p-5')}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
    )
  }
  if (layout === 'table') {
    return (
      <div className={CARD}>
        <div className="px-4 py-3 md:px-5">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 md:px-5">
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="ml-auto h-4 w-1/12" />
              <Skeleton className="h-4 w-1/12" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className={cx(CARD, 'p-4 md:p-5')}>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-6 h-40 w-full" />
    </div>
  )
}

/**
 * The four page-level states. Pages branch in this order:
 * error → loading → empty → content, so an outage never reads as "no data".
 */
export function PageState({
  kind,
  title,
  message,
  error,
  onRetry,
  retrying = false,
  skeleton = 'card',
  icon,
  action,
  backTo = '/',
  backLabel = 'Back to Watchlist',
  children,
  className,
}: PageStateProps) {
  if (kind === 'loading') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={className}
      >
        <span className="sr-only">Loading</span>
        {children ?? <LoadingSkeleton layout={skeleton} />}
      </div>
    )
  }

  if (kind === 'error') {
    return (
      <div role="alert" className={cx(CARD, 'p-4 md:p-5', className)}>
        <div className="flex items-start gap-3">
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-neg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text">
              {title ?? 'Could not load this page'}
            </p>
            <p className="mt-1 text-sm break-words text-muted">
              {message ?? errorMessage(error)}
            </p>
            {children}
            {onRetry ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                loading={retrying}
                className="mt-3"
              >
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'notFound') {
    return (
      <div className={cx(CARD, 'p-4 md:p-5', className)}>
        <p className="text-sm font-medium text-text">{title ?? 'Not found'}</p>
        {message ? <p className="mt-1 text-sm text-muted">{message}</p> : null}
        {children}
        <Link
          to={backTo}
          className="focus-ring mt-3 inline-block rounded text-sm text-accent hover:underline"
        >
          {backLabel}
        </Link>
      </div>
    )
  }

  return (
    <div className={cx(CARD, className)}>
      {children ?? (
        <EmptyState
          icon={icon}
          title={title ?? 'Nothing here yet'}
          body={message}
          action={action}
        />
      )}
    </div>
  )
}
