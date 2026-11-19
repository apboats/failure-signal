import type { Tone } from '@shared/types'
import { cx } from '@/components/ui/cx'
import { TEXT_TONE } from '@/components/ui/tones'

export interface SparklineProps {
  /** Values in time order; non-finite entries are skipped. */
  points: readonly number[]
  width?: number
  height?: number
  /** Stroke colour by tone; chart-1 by default. */
  tone?: Tone
  strokeWidth?: number
  className?: string
}

/**
 * Stroke-only trend line with no axes, drawn as plain SVG (a table can hold
 * sixty of these without a ResizeObserver each). Decorative: aria-hidden, the
 * cell next to it carries the numbers.
 */
export function Sparkline({
  points,
  width = 96,
  height = 24,
  tone,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  const values = points.filter((value) => Number.isFinite(value))
  const classes = cx(
    'shrink-0 overflow-visible',
    tone ? TEXT_TONE[tone] : 'text-chart-1',
    className,
  )
  if (values.length < 2) {
    return (
      <svg
        aria-hidden="true"
        width={width}
        height={height}
        className={classes}
      />
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = strokeWidth
  const innerWidth = width - pad * 2
  const innerHeight = height - pad * 2
  const path = values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * innerWidth
      const y = pad + (1 - (value - min) / span) * innerHeight
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={classes}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
