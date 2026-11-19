/**
 * Everything Recharts needs to follow the theme. Colours are CSS variable
 * references (resolved by the browser from the @theme tokens in src/index.css),
 * so no chart ever carries a hex literal and a token change re-themes every chart.
 */
import { createElement } from 'react'
import type { RiskToken } from '@shared/types'
import { scoreAxisMax } from '@/domain/risk'

export const chartTokens = {
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
  tooltipBg: 'var(--color-chart-tooltip-bg)',
  tooltipBorder: 'var(--color-chart-tooltip-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  surface: 'var(--color-surface)',
  pos: 'var(--color-pos)',
  neg: 'var(--color-neg)',
} as const

/** Series colours in fixed order: a series keeps its slot no matter which others are shown. */
export const seriesColors: readonly string[] = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
]

/** The --color-risk-N token for a band (ReferenceArea fills, threshold lines). */
export function riskColor(token: RiskToken): string {
  return `var(--color-${token})`
}

/** Axis text is 12px (the floor) in the muted ink; ticks are tabular via the container's `tabular-nums`. */
export const CHART_FONT_SIZE = 12

/** Solid hairline grid, horizontal lines only. */
export const gridProps = {
  stroke: chartTokens.grid,
  strokeWidth: 1,
  vertical: false,
} as const

export const axisProps = {
  stroke: chartTokens.axis,
  tickLine: false,
  axisLine: { stroke: chartTokens.grid },
  tick: { fill: chartTokens.muted, fontSize: CHART_FONT_SIZE },
  tickMargin: 6,
} as const

export const tooltipProps = {
  contentStyle: {
    backgroundColor: chartTokens.tooltipBg,
    border: `1px solid ${chartTokens.tooltipBorder}`,
    borderRadius: 8,
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.4)',
    color: chartTokens.text,
    fontSize: CHART_FONT_SIZE,
    padding: '6px 10px',
  },
  labelStyle: { color: chartTokens.muted, marginBottom: 4 },
  itemStyle: { color: chartTokens.text, padding: 0 },
  cursor: { stroke: chartTokens.axis, strokeWidth: 1 },
  isAnimationActive: false,
} as const

export const legendProps = {
  iconType: 'plainline',
  iconSize: 12,
  /** Text wears the text token; the line swatch beside it carries identity. */
  formatter: (value: unknown) =>
    createElement(
      'span',
      { style: { color: chartTokens.muted } },
      String(value),
    ),
  wrapperStyle: {
    fontSize: CHART_FONT_SIZE,
    color: chartTokens.muted,
    paddingTop: 8,
  },
} as const

/** Threshold line style (dashed = threshold, never the grid). */
export const thresholdLineProps = {
  strokeDasharray: '4 4',
  strokeWidth: 1,
} as const

/**
 * Score axis domain: 0 to max(SEVERE, ceil(dataMax * 1.2)), so the bands stay
 * visible and the line never touches the top. Never a fixed 0-to-100 axis.
 */
export const scoreDomain = [
  0,
  (dataMax: number) => scoreAxisMax([dataMax]),
] as const
