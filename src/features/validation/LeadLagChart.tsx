import { ChartLine } from 'lucide-react'
import { WATCH } from '@shared/thresholds'
import { DualAxisChart } from '@/components/charts/DualAxisChart'
import { Card, EmptyState } from '@/components/ui'
import type { ChartPoint } from '@/domain/analytics/leadLag'
import { formatScore } from '@/lib/format'

export interface LeadLagChartProps {
  points: readonly ChartPoint[]
  /** null when no bank is selected. */
  name: string | null
  ticker: string | null
}

const indexValue = (value: number) => value.toFixed(0)

/**
 * Score (left axis, floored at WATCH with a reference line there) against the
 * price indexed to 100 on the first day (right axis, numbers). Dates are
 * 'MMM d' on the axis and 'MMM d, yyyy' in the tooltip.
 */
export function LeadLagChart({ points, name, ticker }: LeadLagChartProps) {
  const title = name
    ? `${name}${ticker ? ` · ${ticker}` : ''}`
    : 'Score vs price'
  return (
    <Card title={title}>
      {name === null ? (
        <EmptyState
          icon={<ChartLine />}
          title="Select a bank to chart it."
          body="Pick a row in the table: score on the left axis, price indexed to its first day on the right."
        />
      ) : (
        <>
          <DualAxisChart
            data={points}
            left={{ key: 'score', name: 'Risk score', format: formatScore }}
            right={{
              key: 'price',
              name: 'Price (first day = 100)',
              format: indexValue,
            }}
            leftFloor={WATCH}
            leftReferenceY={WATCH}
            leftReferenceLabel="Watch"
          />
          <p className="mt-3 text-xs text-muted">
            If the score leads price, rises in the score line should come before
            falls in the price line.
          </p>
        </>
      )}
    </Card>
  )
}
