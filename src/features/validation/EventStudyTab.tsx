import { useCallback, useMemo, useState } from 'react'
import { PageState } from '@/components/ui'
import type { BenchmarkIndex } from '@/domain/analytics/benchmark'
import {
  aggregateStats,
  detectEvents,
  verdict,
  VERDICT_HORIZON,
} from '@/domain/analytics/eventStudy'
import type { BankSeries } from '@/domain/analytics/series'
import type { Institution } from '@shared/types'
import {
  DEFAULT_EVENT_CONTROLS,
  toEventDef,
  type EventControlsValue,
} from './controls'
import { EventControls } from './EventControls'
import { EventsTable, type EventRow } from './EventsTable'
import { ExcessChart } from './ExcessChart'
import { StatsTable } from './StatsTable'
import { VerdictCard } from './VerdictCard'

export interface EventStudyTabProps {
  series: BankSeries
  benchmarks: BenchmarkIndex
  institutions: ReadonlyMap<string, Institution>
}

/**
 * Event study tab. Every statistic comes from src/domain/analytics; the
 * scans run inside useMemo keyed on the series and the controls, so a slider
 * tick recomputes once and a tooltip hover recomputes nothing.
 */
export function EventStudyTab({
  series,
  benchmarks,
  institutions,
}: EventStudyTabProps) {
  const [controls, setControls] = useState<EventControlsValue>(
    DEFAULT_EVENT_CONTROLS,
  )
  const patch = useCallback(
    (next: Partial<EventControlsValue>) =>
      setControls((prev) => ({ ...prev, ...next })),
    [],
  )

  const ticker = controls.benchmarkTicker
  const lookup = useMemo(() => benchmarks.lookup(ticker), [benchmarks, ticker])
  const study = useMemo(
    () => detectEvents(series, toEventDef(controls), lookup),
    [series, controls, lookup],
  )
  const stats = useMemo(
    () => aggregateStats(study.events, study.baseline, study.horizons),
    [study],
  )
  const result = useMemo(() => verdict(stats, VERDICT_HORIZON), [stats])
  const rows = useMemo<EventRow[]>(
    () =>
      study.events.map((event) => {
        const institution = institutions.get(event.institutionId)
        return {
          ...event,
          key: `${event.institutionId}:${event.date}`,
          name: institution?.name ?? 'Unknown bank',
          ticker: institution?.ticker ?? null,
        }
      }),
    [study, institutions],
  )
  const hasBenchmark = benchmarks.size(ticker) > 0

  return (
    <>
      <EventControls
        value={controls}
        onChange={patch}
        horizons={study.horizons}
      />
      {hasBenchmark ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <VerdictCard verdict={result} benchmarkTicker={ticker} />
            <ExcessChart stats={stats} benchmarkTicker={ticker} />
          </div>
          <StatsTable stats={stats} benchmarkTicker={ticker} />
          <EventsTable
            rows={rows}
            distinctDates={study.distinctDates}
            distinctBanks={study.distinctBanks}
            horizons={study.horizons}
            verdictHorizon={VERDICT_HORIZON}
          />
        </>
      ) : (
        <PageState
          kind="empty"
          title={`No ${ticker} closes in this range.`}
          message="Excess returns need the benchmark series. Pick the other benchmark or widen the range."
        />
      )}
    </>
  )
}
