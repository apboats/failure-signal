import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EM_DASH, formatCount, formatPct } from '@/lib/format'
import { cx } from '@/components/ui/cx'
import { axisProps, chartTokens, gridProps, tooltipProps } from './chartTheme'

export interface BarWithErrorDatum {
  /** Category label, e.g. '5d'. */
  label: string
  /** Bar height (mean). null draws no bar. */
  value: number | null
  /** Symmetric error (±SE) or [minus, plus]. */
  error?: number | [number, number] | null
  /** Drawn as a short tick across the bar. */
  median?: number | null
  /** Sample size for the tooltip. */
  n?: number
  /** Grey the bar (n below the reporting floor). */
  muted?: boolean
}

export interface BarWithErrorProps {
  data: readonly BarWithErrorDatum[]
  height?: number
  /** Name of the bar value in the tooltip. */
  valueName?: string
  /** Formats values on the axis and in the tooltip; formatPct by default. */
  format?: (value: number) => string
  /** Flip the valence colouring: for a short, a negative excess return is good. */
  positiveIsBad?: boolean
  className?: string
}

function fillFor(datum: BarWithErrorDatum, positiveIsBad: boolean): string {
  if (datum.muted || datum.value === null || datum.value === 0)
    return chartTokens.muted
  return datum.value > 0 !== positiveIsBad ? chartTokens.pos : chartTokens.neg
}

function MedianTick({ cx: x, cy: y }: { cx?: number; cy?: number }) {
  if (x === undefined || y === undefined) return <g />
  return (
    <line
      x1={x - 9}
      x2={x + 9}
      y1={y}
      y2={y}
      stroke={chartTokens.text}
      strokeWidth={2}
      strokeLinecap="round"
    />
  )
}

function BarTooltip({
  active,
  label,
  data,
  valueName,
  format,
}: {
  active?: boolean
  label?: unknown
  data: readonly BarWithErrorDatum[]
  valueName: string
  format: (value: number) => string
}) {
  if (!active) return null
  const datum = data.find((entry) => entry.label === String(label))
  if (!datum) return null
  const error =
    datum.error === null || datum.error === undefined
      ? null
      : Array.isArray(datum.error)
        ? `−${format(datum.error[0])} / +${format(datum.error[1])}`
        : `± ${format(datum.error)}`
  return (
    <div className="rounded-lg border border-chart-tooltip-border bg-chart-tooltip-bg px-3 py-2 text-xs text-text shadow-lg tabular-nums">
      <p className="text-muted">{datum.label}</p>
      <p>
        {valueName} {datum.value === null ? EM_DASH : format(datum.value)}
        {error ? <span className="text-muted"> {error}</span> : null}
      </p>
      {datum.median !== undefined && datum.median !== null ? (
        <p>Median {format(datum.median)}</p>
      ) : null}
      {datum.n !== undefined ? (
        <p className="text-muted">n = {formatCount(datum.n)}</p>
      ) : null}
    </div>
  )
}

/**
 * Categorical bars (e.g. horizons 1d/5d/10d/20d) with ±SE error bars and a
 * median tick, coloured by valence. Never a line through categories.
 */
export function BarWithError({
  data,
  height = 240,
  valueName = 'Mean',
  format = (value) => formatPct(value, 2),
  positiveIsBad = false,
  className,
}: BarWithErrorProps) {
  const rows = data.map((datum) => ({
    ...datum,
    error:
      datum.error === null || datum.error === undefined
        ? undefined
        : Array.isArray(datum.error)
          ? datum.error
          : [datum.error, datum.error],
  }))
  if (rows.length === 0) {
    return (
      <div
        className={cx(
          'flex items-center justify-center text-sm text-muted',
          className,
        )}
        style={{ height }}
      >
        No horizons to show.
      </div>
    )
  }
  const label = `${valueName} by horizon with error bars, ${formatCount(rows.length)} horizons`
  return (
    <div
      role="figure"
      aria-label={label}
      className={cx('tabular-nums', className)}
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barCategoryGap="35%"
        >
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={56} tickFormatter={format} />
          <ReferenceLine y={0} stroke={chartTokens.axis} strokeWidth={1} />
          <Tooltip
            {...tooltipProps}
            cursor={{ fill: chartTokens.surface }}
            content={(props) => (
              <BarTooltip
                active={props.active}
                label={props.label}
                data={data}
                valueName={valueName}
                format={format}
              />
            )}
          />
          <Bar
            dataKey="value"
            name={valueName}
            maxBarSize={32}
            radius={2}
            isAnimationActive={false}
          >
            {data.map((datum) => (
              <Cell key={datum.label} fill={fillFor(datum, positiveIsBad)} />
            ))}
            <ErrorBar
              dataKey="error"
              width={6}
              strokeWidth={1.5}
              stroke={chartTokens.text}
            />
          </Bar>
          <Scatter
            dataKey="median"
            name="Median"
            shape={MedianTick}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
