import { useId, type ReactNode } from 'react'
import { cx } from './cx'
import { SectionHeader } from './SectionHeader'

export interface CardProps {
  title?: ReactNode
  count?: number | string | null
  action?: ReactNode
  children: ReactNode
  /** p-4 md:p-5 body. Pass false for tables and ListRows, which bring their own padding. */
  padded?: boolean
  /** h2 by default; h3 when the card sits under an in-page h2. */
  level?: 2 | 3
  className?: string
  id?: string
}

/**
 * The only bordered surface. Nothing bordered goes inside it: use ListRows
 * dividers or a DataTable. Header row (h2 + count + action) renders only when
 * `title` is set.
 */
export function Card({
  title,
  count,
  action,
  children,
  padded = true,
  level = 2,
  className,
  id,
}: CardProps) {
  const headingId = useId()
  const hasTitle = title !== undefined && title !== null
  return (
    <section
      id={id}
      aria-labelledby={hasTitle ? headingId : undefined}
      className={cx('rounded-xl border border-border bg-surface', className)}
    >
      {hasTitle ? (
        <SectionHeader
          id={headingId}
          title={title}
          count={count}
          action={action}
          level={level}
          className="border-b border-border px-4 py-3 md:px-5"
        />
      ) : null}
      <div className={padded ? 'p-4 md:p-5' : undefined}>{children}</div>
    </section>
  )
}
