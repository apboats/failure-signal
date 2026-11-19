import { cx } from './cx'

export interface SkeletonProps {
  /** Size classes, e.g. 'h-4 w-24'. Defaults to a full-width text line. */
  className?: string
  /** Render inline (for a table cell or beside text). */
  inline?: boolean
}

/** Loading placeholder block. Decorative: callers put role="status" on the container. */
export function Skeleton({ className, inline = false }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'animate-pulse rounded bg-surface-2',
        inline ? 'inline-block align-middle' : 'block',
        className ?? (inline ? 'h-4 w-12' : 'h-4 w-full'),
      )}
    />
  )
}
