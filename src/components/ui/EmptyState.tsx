import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface EmptyStateProps {
  /** A lucide icon element; Inbox by default. */
  icon?: ReactNode
  title: ReactNode
  /** Say what would fill this: "No open positions. Open one from a trading signal." */
  body?: ReactNode
  action?: ReactNode
  className?: string
}

/** Centred empty state for a Card body or table. Copy states what would fill it. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="text-muted [&>svg]:size-6">
        {icon ?? <Inbox />}
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      {body ? <p className="max-w-sm text-xs text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
