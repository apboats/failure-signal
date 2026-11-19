import { getRiskLevel } from '@shared/constants'
import { formatScore } from '@/lib/format'
import { Badge } from './Badge'
import { cx } from './cx'
import { TEXT_TONE } from './tones'

export type ScoreValueSize = 'sm' | 'md' | 'lg'

const SIZE: Record<ScoreValueSize, string> = {
  /** Body size: table cells and list rows. */
  sm: 'text-sm',
  /** Stat-value size: tiles. */
  md: 'text-2xl',
  /** Display size: the detail hero only. */
  lg: 'text-[28px] leading-8',
}

export interface ScoreValueProps {
  score: number | null | undefined
  size?: ScoreValueSize
  /** Also render the band label as a Badge. */
  withLevel?: boolean
  className?: string
}

/**
 * The only way a risk score is rendered: one decimal, tinted by its band
 * (text-risk-N from getRiskLevel), '—' in text-muted when there is no score.
 */
export function ScoreValue({
  score,
  size = 'sm',
  withLevel = false,
  className,
}: ScoreValueProps) {
  const hasScore = typeof score === 'number' && Number.isFinite(score)
  const level = hasScore ? getRiskLevel(score) : null
  return (
    <span className={cx('inline-flex items-baseline gap-2', className)}>
      <span
        className={cx(
          'font-semibold tabular-nums',
          SIZE[size],
          level ? TEXT_TONE[level.token] : 'text-muted',
        )}
      >
        {formatScore(score)}
        {level && !withLevel ? (
          <span className="sr-only">, {level.label}</span>
        ) : null}
      </span>
      {withLevel ? (
        <Badge
          tone={level?.token ?? 'neutral'}
          size={size === 'sm' ? 'sm' : 'md'}
        >
          {level?.label ?? 'No score'}
        </Badge>
      ) : null}
    </span>
  )
}
