import { useMemo } from 'react'
import {
  BarWithError,
  type BarWithErrorDatum,
} from '@/components/charts/BarWithError'
import { Card } from '@/components/ui'
import {
  MIN_EVENTS_PER_HORIZON,
  type HorizonStats,
} from '@/domain/analytics/eventStudy'

export interface ExcessChartProps {
  stats: readonly HorizonStats[]
  benchmarkTicker: string
}

/** Mean excess per horizon as bars with ± SE error bars and a median tick; never a line through categories. */
export function ExcessChart({ stats, benchmarkTicker }: ExcessChartProps) {
  const data = useMemo<BarWithErrorDatum[]>(
    () =>
      stats.map((row) => ({
        label: `${row.horizon}d`,
        value: row.avgExcess,
        error: row.se,
        median: row.median,
        n: row.n,
        muted: row.insufficient,
      })),
    [stats],
  )
  return (
    <Card title={`Average excess return vs ${benchmarkTicker}`}>
      <BarWithError
        data={data}
        valueName="Mean excess"
        positiveIsBad
        height={240}
      />
      <p className="mt-3 text-xs text-muted">
        Bars are the mean excess return per horizon with ± SE error bars; the
        tick is the median. Below zero is good for a short. Grey bars have fewer
        than {MIN_EVENTS_PER_HORIZON} events.
      </p>
    </Card>
  )
}
