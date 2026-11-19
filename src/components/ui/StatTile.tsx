import type { ReactNode } from 'react'
import type { Tone } from '@shared/types'
import { EM_DASH } from '@/lib/format'
import { cx } from './cx'
import { TEXT_TONE } from './tones'

export interface StatTileProps {
  label: ReactNode
  /** Pre-formatted value (formatCount, formatCurrency, ScoreValue...). null renders '—'. */
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  /** Makes the tile a toggle button with aria-pressed={active}. */
  onClick?: () => void
  active?: boolean
  className?: string
}

/** Card-styled KPI tile: meta label, text-2xl tabular value, optional sub line. */
export function StatTile({
  label,
  value,
  sub,
  tone,
  onClick,
  active = false,
  className,
}: StatTileProps) {
  const missing = value === null || value === undefined
  const inner = (
    <>
      <span className="block text-xs text-muted">{label}</span>
      <span
        className={cx(
          'mt-1 block text-2xl font-semibold tabular-nums',
          missing ? 'text-muted' : tone ? TEXT_TONE[tone] : 'text-text',
        )}
      >
        {missing ? EM_DASH : value}
      </span>
      {sub ? (
        <span className="mt-1 block text-xs text-muted">{sub}</span>
      ) : null}
    </>
  )
  const base = 'block w-full rounded-xl border bg-surface p-4 text-left md:p-5'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cx(
          base,
          'focus-ring transition-colors hover:bg-surface-2',
          active ? 'border-accent ring-1 ring-accent' : 'border-border',
          className,
        )}
      >
        {inner}
      </button>
    )
  }
  return <div className={cx(base, 'border-border', className)}>{inner}</div>
}
