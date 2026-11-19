import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCount, formatDate } from '@/lib/format'
import { cx } from '@/components/ui/cx'
import {
  axisProps,
  CHART_FONT_SIZE,
  chartTokens,
  gridProps,
  legendProps,
  seriesColors,
  thresholdLineProps,
  tooltipProps,
} from './chartTheme'

export interface DualAxisSeries<T> {
  /** Numeric field of T (numbers, not strings). */
  key: keyof T & string
  name: string
  /** A chartTheme colour; defaults to chart-1 (left) and chart-2 (right). */
  color?: string
  /** Tick and tooltip formatting for this series. */
  format?: (value: number) => string
}

export interface DualAxisChartProps<T extends { date: string }> {
  /** Ascending by `date` ('YYYY-MM-DD'). */
  data: readonly T[]
  left: DualAxisSeries<T>
  right: DualAxisSeries<T>
  /** The left axis top never drops below this (keeps a threshold line in view). */
  leftFloor?: number
  /** Dashed threshold line on the left axis (e.g. WATCH). */
  leftReferenceY?: number
  leftReferenceLabel?: string
  height?: number
  className?: string
}

const tickDate = (iso: string) => formatDate(iso, 'MMM d')
const labelDate = (label: unknown) => formatDate(String(label))
const identity = (value: number) => String(value)

/**
 * Two series on one time axis, each with its own numeric scale: the score
 * (left, floored so the threshold stays visible) and an index-normalised
 * price (right). Legend + axis labels carry identity, not colour alone.
 * Prefer one scale when the series are commensurable; this exists for the
 * Validation lead-lag view where they are not.
 */
export function DualAxisChart<T extends { date: string }>({
  data,
  left,
  right,
  leftFloor = 0,
  leftReferenceY,
  leftReferenceLabel,
  height = 280,
  className,
}: DualAxisChartProps<T>) {
  const rows = useMemo(() => [...data], [data])
  const leftDomain = useMemo(
    () =>
      [
        0,
        (dataMax: number) => Math.max(leftFloor, Math.ceil(dataMax * 1.1)),
      ] as const,
    [leftFloor],
  )
  if (rows.length === 0) {
    return (
      <div
        className={cx(
          'flex items-center justify-center text-sm text-muted',
          className,
        )}
        style={{ height }}
      >
        No data in this range.
      </div>
    )
  }
  const leftColor = left.color ?? seriesColors[0]
  const rightColor = right.color ?? seriesColors[1]
  const leftFormat = left.format ?? identity
  const rightFormat = right.format ?? identity
  const label = `${left.name} and ${right.name}, ${formatCount(rows.length)} points from ${formatDate(rows[0].date)} to ${formatDate(rows[rows.length - 1].date)}`

  return (
    <div
      role="figure"
      aria-label={label}
      className={cx('tabular-nums', className)}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
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
            yAxisId="left"
            {...axisProps}
            width={40}
            domain={leftDomain}
            tickFormatter={leftFormat}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            type="number"
            {...axisProps}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={rightFormat}
          />
          {leftReferenceY !== undefined ? (
            <ReferenceLine
              yAxisId="left"
              y={leftReferenceY}
              stroke={chartTokens.axis}
              {...thresholdLineProps}
              label={
                leftReferenceLabel
                  ? {
                      value: leftReferenceLabel,
                      position: 'insideTopLeft',
                      fill: chartTokens.muted,
                      fontSize: CHART_FONT_SIZE,
                    }
                  : undefined
              }
            />
          ) : null}
          <Tooltip
            {...tooltipProps}
            labelFormatter={labelDate}
            formatter={(value, name) => [
              (name === left.name ? leftFormat : rightFormat)(Number(value)),
              String(name),
            ]}
          />
          <Legend {...legendProps} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={left.key}
            name={left.name}
            stroke={leftColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: leftColor,
              stroke: chartTokens.surface,
              strokeWidth: 2,
            }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey={right.key}
            name={right.name}
            stroke={rightColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: rightColor,
              stroke: chartTokens.surface,
              strokeWidth: 2,
            }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
