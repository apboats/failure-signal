import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RISK_LEVELS } from '@shared/constants'
import { SHORT_ENTRY, WATCH } from '@shared/thresholds'
import type { ScoreHistoryPoint } from '@shared/types'
import { formatCount, formatDate, formatScore } from '@/lib/format'
import { cx } from '@/components/ui/cx'
import {
  axisProps,
  CHART_FONT_SIZE,
  chartTokens,
  gridProps,
  riskColor,
  scoreDomain,
  seriesColors,
  thresholdLineProps,
  tooltipProps,
} from './chartTheme'

export type ScoreRange = '30d' | '90d' | 'all'

export interface ScoreChartProps {
  /** Ascending by date. `date` is 'YYYY-MM-DD' (parsed with parseISO). */
  points: readonly ScoreHistoryPoint[]
  /** Only affects marks: 30d shows a dot per point. */
  range?: ScoreRange
  height?: number
  /** Tinted RISK_LEVELS bands behind the line. */
  showBands?: boolean
  className?: string
}

const tickDate = (iso: string) => formatDate(iso, 'MMM d')
const labelDate = (label: unknown) => formatDate(String(label))

/**
 * Score history: one line in chart-1 over the five risk bands, dashed
 * threshold lines at WATCH and SHORT_ENTRY, Y domain floored at SEVERE.
 */
export function ScoreChart({
  points,
  range,
  height = 240,
  showBands = true,
  className,
}: ScoreChartProps) {
  const data = points.filter((point) => Number.isFinite(point.score))
  if (data.length === 0) {
    return (
      <div
        className={cx(
          'flex items-center justify-center text-sm text-muted',
          className,
        )}
        style={{ height }}
      >
        No score history in this range.
      </div>
    )
  }
  const first = data[0].date
  const last = data[data.length - 1].date
  const label = `Score history, ${formatCount(data.length)} points from ${formatDate(first)} to ${formatDate(last)}`
  const stroke = seriesColors[0]

  return (
    <div
      role="figure"
      aria-label={label}
      className={cx('tabular-nums', className)}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={tickDate}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            {...axisProps}
            width={32}
            domain={scoreDomain}
            tickCount={6}
            allowDecimals={false}
          />
          {showBands
            ? RISK_LEVELS.map((level) => (
                <ReferenceArea
                  key={level.token}
                  y1={level.min}
                  y2={level.max}
                  fill={riskColor(level.token)}
                  fillOpacity={0.06}
                  stroke="none"
                  ifOverflow="hidden"
                />
              ))
            : null}
          <ReferenceLine
            y={WATCH}
            stroke={riskColor('risk-3')}
            {...thresholdLineProps}
            label={{
              value: `Watch ${WATCH}`,
              position: 'insideTopRight',
              fill: chartTokens.muted,
              fontSize: CHART_FONT_SIZE,
            }}
          />
          <ReferenceLine
            y={SHORT_ENTRY}
            stroke={riskColor('risk-4')}
            {...thresholdLineProps}
            label={{
              value: `Short entry ${SHORT_ENTRY}`,
              position: 'insideTopRight',
              fill: chartTokens.muted,
              fontSize: CHART_FONT_SIZE,
            }}
          />
          <Tooltip
            {...tooltipProps}
            labelFormatter={labelDate}
            formatter={(value) => [formatScore(Number(value)), 'Score']}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={
              range === '30d' ? { r: 2.5, fill: stroke, strokeWidth: 0 } : false
            }
            activeDot={{
              r: 4,
              fill: stroke,
              stroke: chartTokens.surface,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
