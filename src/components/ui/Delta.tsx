import { ArrowDown, ArrowUp } from 'lucide-react'
import { EM_DASH, formatSigned } from '@/lib/format'
import { cx } from './cx'

export interface DeltaProps {
  value: number | null | undefined
  digits?: number
  suffix?: string
  /** Flip the valence rule: a rising risk score or a rising hit rate against the short is bad. */
  positiveIsBad?: boolean
  showIcon?: boolean
  className?: string
}

/**
 * Signed change coloured by valence (pos/neg), the only place red/green mean
 * good/bad for the operator. Zero is muted and unsigned; null is '—'.
 */
export function Delta({
  value,
  digits = 2,
  suffix = '',
  positiveIsBad = false,
  showIcon = false,
  className,
}: DeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cx('text-muted tabular-nums', className)}>
        {EM_DASH}
      </span>
    )
  }
  const rounded = Number(value.toFixed(digits))
  const tone =
    rounded === 0
      ? 'text-muted'
      : rounded > 0 !== positiveIsBad
        ? 'text-pos'
        : 'text-neg'
  const Icon = rounded > 0 ? ArrowUp : rounded < 0 ? ArrowDown : null
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 tabular-nums',
        tone,
        className,
      )}
    >
      {showIcon && Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {formatSigned(value, digits, suffix)}
    </span>
  )
}
