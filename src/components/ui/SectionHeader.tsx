import type { ReactNode } from 'react'
import { formatCount } from '@/lib/format'
import { cx } from './cx'

export interface SectionHeaderProps {
  title: ReactNode
  /** Muted count next to the title (a number is formatted with separators). */
  count?: number | string | null
  action?: ReactNode
  /** h2 by default; h3 only for a card that already sits under an in-page h2. */
  level?: 2 | 3
  className?: string
  id?: string
}

/** The h2 row (text-sm font-semibold) used standalone when a Card has no title. */
export function SectionHeader({
  title,
  count,
  action,
  level = 2,
  className = 'mb-3',
  id,
}: SectionHeaderProps) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className={cx('flex items-center justify-between gap-2', className)}>
      <Heading
        id={id}
        className={cx(
          'flex min-w-0 items-baseline gap-2 text-sm text-text',
          level === 3 ? 'font-medium' : 'font-semibold',
        )}
      >
        <span className="truncate">{title}</span>
        {count !== undefined && count !== null ? (
          <span className="shrink-0 text-xs font-normal text-muted tabular-nums">
            {typeof count === 'number' ? formatCount(count) : count}
          </span>
        ) : null}
      </Heading>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </div>
  )
}
