import { TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from './Badge'

export type Direction = 'short' | 'long'

export interface DirectionBadgeProps {
  direction: Direction
  size?: 'sm' | 'md'
  className?: string
}

/** Neutral chip for a position direction: icon + text, never red/green. */
export function DirectionBadge({
  direction,
  size,
  className,
}: DirectionBadgeProps) {
  const short = direction === 'short'
  return (
    <Badge
      tone="neutral"
      size={size}
      className={className}
      icon={short ? <TrendingDown /> : <TrendingUp />}
    >
      {short ? 'Short' : 'Long'}
    </Badge>
  )
}
