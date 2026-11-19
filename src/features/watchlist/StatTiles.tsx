import type { ReactNode } from 'react'
import { Skeleton, StatTile } from '@/components/ui'
import { formatCount } from '@/lib/format'
import { WATCH } from '@shared/thresholds'
import type {
  SecondaryStatus,
  TileCounts,
  TileFilter,
} from './useWatchlistData'

export interface StatTilesProps {
  tiles: TileCounts
  /** Which query feeds which tile, for skeletons and "Could not load". */
  status: {
    scores: SecondaryStatus
    signals: SecondaryStatus
    trading: SecondaryStatus
  }
  active: TileFilter | null
  onToggle: (tile: TileFilter) => void
}

function tileValue(status: SecondaryStatus, count: number): ReactNode {
  if (status.error) return null
  if (status.isPending) return <Skeleton inline className="h-7 w-12" />
  return formatCount(count)
}

function tileSub(status: SecondaryStatus, sub: string): string {
  return status.error ? 'Could not load' : sub
}

/**
 * The four KPI tiles. Each is a toggle (aria-pressed) that narrows the table
 * to the banks it counts; pressing it again clears the filter.
 */
export function StatTiles({ tiles, status, active, onToggle }: StatTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label="Banks scored"
        value={tileValue(status.scores, tiles.scored)}
        sub={tileSub(status.scores, `of ${formatCount(tiles.total)} active`)}
        onClick={() => onToggle('scored')}
        active={active === 'scored'}
      />
      <StatTile
        label="Elevated"
        value={tileValue(status.scores, tiles.elevated)}
        sub={tileSub(status.scores, `score ≥ ${WATCH}`)}
        tone={tiles.elevated > 0 && !status.scores.error ? 'risk-3' : undefined}
        onClick={() => onToggle('elevated')}
        active={active === 'elevated'}
      />
      <StatTile
        label="Signals 24h"
        value={tileValue(status.signals, tiles.signals24h)}
        sub={tileSub(status.signals, 'risk signals, all banks')}
        onClick={() => onToggle('signals24h')}
        active={active === 'signals24h'}
      />
      <StatTile
        label="Active trade signals"
        value={tileValue(status.trading, tiles.tradeSignals)}
        sub={tileSub(status.trading, 'short entry and watch')}
        onClick={() => onToggle('trade')}
        active={active === 'trade'}
      />
    </div>
  )
}
