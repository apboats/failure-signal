import { SEVERE } from '@shared/thresholds'
import {
  Card,
  Field,
  Range,
  SegmentedControl,
  type SegmentedOption,
} from '@/components/ui'
import { formatScore } from '@/lib/format'
import {
  BENCHMARK_TICKERS,
  MAX_VELOCITY_WINDOW,
  type EventControlsValue,
  type EventKind,
} from './controls'

export interface EventControlsProps {
  value: EventControlsValue
  onChange: (patch: Partial<EventControlsValue>) => void
  /** Horizons in trading days, for the explanatory line. */
  horizons: readonly number[]
}

const KIND_OPTIONS: readonly SegmentedOption<EventKind>[] = [
  { value: 'level', label: 'Level' },
  { value: 'velocity', label: 'Velocity' },
]

const TICKER_OPTIONS: readonly SegmentedOption<string>[] =
  BENCHMARK_TICKERS.map((ticker) => ({ value: ticker, label: ticker }))

const windowValue = (days: number) => `${days}d`

function horizonsText(horizons: readonly number[]): string {
  if (horizons.length === 0) return ''
  if (horizons.length === 1) return String(horizons[0])
  return `${horizons.slice(0, -1).join(', ')} and ${horizons[horizons.length - 1]}`
}

/** Event definition: Level or Velocity, the benchmark, and the labelled sliders with live values. */
export function EventControls({
  value,
  onChange,
  horizons,
}: EventControlsProps) {
  return (
    <Card title="Event definition">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Event</span>
          <SegmentedControl
            aria-label="Event type"
            options={KIND_OPTIONS}
            value={value.kind}
            onChange={(kind) => onChange({ kind })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Benchmark</span>
          <SegmentedControl
            aria-label="Benchmark"
            options={TICKER_OPTIONS}
            value={value.benchmarkTicker}
            onChange={(benchmarkTicker) => onChange({ benchmarkTicker })}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {value.kind === 'level' ? (
          <Field
            label="Score crosses at or above"
            htmlFor="event-level-threshold"
            hint="Fires on the first trading day the score reaches this level after a day below it. The prior day must be within four calendar days."
          >
            <Range
              id="event-level-threshold"
              value={value.levelThreshold}
              min={1}
              max={SEVERE}
              step={1}
              onValueChange={(levelThreshold) => onChange({ levelThreshold })}
              format={formatScore}
              aria-describedby="event-level-threshold-hint"
            />
          </Field>
        ) : (
          <>
            <Field
              label="Score rises by at least"
              htmlFor="event-velocity-delta"
              hint="Points gained over the window. Fires only on the first day the condition holds."
            >
              <Range
                id="event-velocity-delta"
                value={value.velocityDelta}
                min={1}
                max={SEVERE}
                step={1}
                onValueChange={(velocityDelta) => onChange({ velocityDelta })}
                format={formatScore}
                aria-describedby="event-velocity-delta-hint"
              />
            </Field>
            <Field
              label="Over a window of (trading days)"
              htmlFor="event-velocity-window"
              hint="Compared with the score this many trading days earlier."
            >
              <Range
                id="event-velocity-window"
                value={value.velocityWindow}
                min={1}
                max={MAX_VELOCITY_WINDOW}
                step={1}
                onValueChange={(velocityWindow) => onChange({ velocityWindow })}
                format={windowValue}
                aria-describedby="event-velocity-window-hint"
              />
            </Field>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Returns are measured {horizonsText(horizons)} trading days after each
        event, relative to {value.benchmarkTicker}. A negative excess return
        means the bank underperformed the benchmark, which is what a short
        wants.
      </p>
      {value.kind === 'velocity' ? (
        <p className="mt-2 text-xs text-muted">
          Caution: velocity events cluster. One sector move can fire several
          banks on the same date, so n overstates the independent observations;
          the events header counts distinct dates and banks.
        </p>
      ) : null}
    </Card>
  )
}
