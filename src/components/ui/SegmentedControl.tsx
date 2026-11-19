import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SegmentedOption<V extends string> {
  value: V
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<V extends string> {
  options: readonly SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  'aria-label': string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Single-select toggle group (Active/All, 30d/90d/All, Open/Closed/All,
 * Short/Long with DirectionBadge icons). Neutral styling only: active is
 * bg-surface-2 text-text, never red/green.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  className,
}: SegmentedControlProps<V>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex items-center gap-0.5 rounded-lg bg-bg p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'focus-ring inline-flex items-center gap-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50',
              size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5',
              active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
            )}
          >
            {option.icon ? (
              <span aria-hidden="true" className="inline-flex [&>svg]:size-3.5">
                {option.icon}
              </span>
            ) : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
