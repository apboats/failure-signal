import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from '@shared/types'
import { cx } from './cx'
import { BG_TONE } from './tones'

/** The list container: divide-y rows, no inner borders. Put it in a Card with padded={false}. */
export function ListRows({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <ul className={cx('divide-y divide-border', className)}>{children}</ul>
}

export interface ListRowProps {
  /** Badge, icon or ScoreValue before the text. */
  leading?: ReactNode
  title: ReactNode
  /** Meta line (text-xs text-muted) under the title. */
  meta?: ReactNode
  /** Right-aligned values (Delta, Sparkline, price, time). */
  trailing?: ReactNode
  /** 3px left bar in the tone colour (signal severity). */
  accent?: Tone
  /** Renders the row as a Link. */
  to?: string
  /** Renders the row as a button. */
  onClick?: () => void
  selected?: boolean
  className?: string
}

/** One row of a ListRows list. Keyboard focusable when `to` or `onClick` is set. */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  accent,
  to,
  onClick,
  selected,
  className,
}: ListRowProps) {
  const interactive = Boolean(to || onClick)
  const rowClass = cx(
    'relative flex w-full items-center gap-3 px-4 py-3 text-left md:px-5',
    interactive && 'focus-ring transition-colors hover:bg-surface-2',
    selected && 'bg-surface-2',
    className,
  )
  const content = (
    <>
      {accent ? (
        <span
          aria-hidden="true"
          className={cx(
            'absolute inset-y-2 left-0 w-[3px] rounded-full',
            BG_TONE[accent],
          )}
        />
      ) : null}
      {leading ? (
        <span className="flex shrink-0 items-center">{leading}</span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{title}</span>
        {meta ? (
          <span className="mt-0.5 block text-xs text-muted">{meta}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          {trailing}
        </span>
      ) : null}
    </>
  )
  return (
    <li>
      {to ? (
        <Link
          to={to}
          aria-current={selected ? 'true' : undefined}
          className={rowClass}
        >
          {content}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected === undefined ? undefined : selected}
          className={rowClass}
        >
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  )
}
