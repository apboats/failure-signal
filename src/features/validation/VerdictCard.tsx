import type { ReactNode } from 'react'
import { Badge, Card, Delta } from '@/components/ui'
import type { Verdict } from '@/domain/analytics/eventStudy'
import { PREDICTIVE_T } from '@/domain/analytics/eventStudy'
import type { Interval } from '@/domain/analytics/stats'
import { EM_DASH, formatCount, formatPct } from '@/lib/format'

export interface VerdictCardProps {
  verdict: Verdict
  benchmarkTicker: string
}

const pct0 = (value: number | null) =>
  value === null ? EM_DASH : `${Math.round(value)}%`

const ciText = (interval: Interval | null) =>
  interval
    ? `CI ${Math.round(interval.lower)}–${Math.round(interval.upper)}%`
    : null

function Stat({
  label,
  value,
  sub,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-text tabular-nums">
        {value}
      </dd>
      {sub ? <dd className="mt-0.5 text-xs text-muted">{sub}</dd> : null}
    </div>
  )
}

/**
 * The headline of the event study. The tone is valence (the model was
 * right / wrong / cannot be judged yet) and every number is the measured one:
 * mean ± 1.96·SE, n of total, the Welch t and the baseline from non-event
 * days in the same window. Never an asserted "~50%".
 */
export function VerdictCard({ verdict, benchmarkTicker }: VerdictCardProps) {
  const {
    kind,
    horizon,
    n,
    total,
    needed,
    t,
    meanPm,
    hitRate,
    hitCI,
    corroboratedByHitRate,
    baseHitRate,
    baseMean,
    baseN,
  } = verdict

  const tone =
    kind === 'predictive' ? 'pos' : kind === 'no-edge' ? 'neg' : 'neutral'
  const badge =
    kind === 'predictive'
      ? `Predictive at ${horizon}d`
      : kind === 'no-edge'
        ? `No edge at ${horizon}d`
        : 'Insufficient'
  const headline =
    kind === 'insufficient'
      ? `Insufficient: n=${formatCount(n)} at ${horizon}d (need ${needed})`
      : kind === 'predictive'
        ? `Flagged banks underperformed ${benchmarkTicker} over the next ${horizon} trading days`
        : `No edge detected over the next ${horizon} trading days`

  const hitSub = hitCI
    ? `${ciText(hitCI)} · ${
        corroboratedByHitRate
          ? 'lower bound above the baseline'
          : 'lower bound not above the baseline'
      }`
    : 'no events with a non-zero return'

  return (
    <Card title="Verdict">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{badge}</Badge>
        <p className="text-sm font-medium text-text">{headline}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={`Mean excess at ${horizon}d`}
          value={
            meanPm ? (
              <span className="inline-flex items-baseline gap-1">
                <Delta value={meanPm.mean} suffix="%" positiveIsBad />
                <span className="font-normal text-muted">
                  ± {meanPm.halfWidth.toFixed(2)}%
                </span>
              </span>
            ) : (
              <span className="text-muted">{EM_DASH}</span>
            )
          }
          sub="mean ± 1.96·SE"
        />
        <Stat
          label="Events"
          value={`${formatCount(n)} of ${formatCount(total)}`}
          sub="with a benchmark return at this horizon"
        />
        <Stat
          label="t vs baseline"
          value={
            t === null ? (
              <span className="text-muted">{EM_DASH}</span>
            ) : (
              t.toFixed(2)
            )
          }
          sub={`Welch t; predictive at t ≤ ${PREDICTIVE_T} with n ≥ ${needed}`}
        />
        <Stat label="Hit rate" value={pct0(hitRate)} sub={hitSub} />
      </dl>
      <p className="mt-4 text-xs text-muted">
        Baseline: non-event days in the same window underperformed{' '}
        {benchmarkTicker} {pct0(baseHitRate)} of the time (n ={' '}
        {formatCount(baseN)}), with a mean excess of{' '}
        {baseMean === null ? EM_DASH : formatPct(baseMean)}. The hit-rate
        interval corroborates; the t test decides.
      </p>
    </Card>
  )
}
