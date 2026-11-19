import type { ReactNode } from 'react'
import type { Tone } from '@shared/types'
import { cx } from './cx'
import { BADGE_TONE } from './tones'

export interface BadgeProps {
  /** Colour meaning. Risk uses risk-1..5, severity sev-*, valence pos/neg, everything else neutral/accent. */
  tone?: Tone
  size?: 'sm' | 'md'
  /** A lucide icon element; rendered at 12px before the text. */
  icon?: ReactNode
  children: ReactNode
  className?: string
  title?: string
}

/** Rounded pill: 15% tint of the tone behind text in the tone colour. Replaces every inline `${hex}20` chip. */
export function Badge({
  tone = 'neutral',
  size = 'md',
  icon,
  children,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full text-xs font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-px' : 'px-2 py-0.5',
        BADGE_TONE[tone],
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 [&>svg]:size-3"
        >
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
