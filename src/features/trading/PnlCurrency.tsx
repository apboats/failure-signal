import { cx } from '@/components/ui'
import { EM_DASH, formatCurrency } from '@/lib/format'

export interface PnlCurrencyProps {
  value: number | null | undefined
  className?: string
}

/**
 * Signed dollar P&L coloured by valence, the same rule as <Delta> (pos / neg /
 * muted at zero, '—' for null) but formatted with formatCurrency, which Delta
 * cannot do ('+$1,234.56' rather than '+1234.56').
 */
export function PnlCurrency({ value, className }: PnlCurrencyProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cx('text-muted tabular-nums', className)}>
        {EM_DASH}
      </span>
    )
  }
  const rounded = Math.round(value * 100) / 100
  const tone =
    rounded === 0 ? 'text-muted' : rounded > 0 ? 'text-pos' : 'text-neg'
  return (
    <span className={cx('tabular-nums', tone, className)}>
      {formatCurrency(value)}
    </span>
  )
}
