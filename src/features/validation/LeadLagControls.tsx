import { useState } from 'react'
import { Card, Field, Input, Select } from '@/components/ui'
import { isLagDays, LAG_OPTIONS, type LagDays } from './controls'

export interface LeadLagControlsProps {
  lagDays: LagDays
  onLagChange: (lag: LagDays) => void
  minObs: number
  onMinObsChange: (minObs: number) => void
}

/** Lag Select (1/3/7/14 trading days) and the minimum-observations input, both labelled. */
export function LeadLagControls({
  lagDays,
  onLagChange,
  minObs,
  onMinObsChange,
}: LeadLagControlsProps) {
  // The text the person is typing; the committed number only changes on a valid value.
  const [draft, setDraft] = useState(String(minObs))

  return (
    <Card title="Lead-lag settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Lag"
          htmlFor="leadlag-lag"
          hint="Compare each day's score with the price this many trading days later."
        >
          <Select
            id="leadlag-lag"
            value={String(lagDays)}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (isLagDays(next)) onLagChange(next)
            }}
          >
            {LAG_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} trading {days === 1 ? 'day' : 'days'}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Min observations"
          htmlFor="leadlag-min-obs"
          hint="Days with a forward return a bank needs before it is listed."
        >
          <Input
            id="leadlag-min-obs"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              const next = Math.floor(event.target.valueAsNumber)
              if (Number.isFinite(next) && next >= 1) onMinObsChange(next)
            }}
          />
        </Field>
      </div>
    </Card>
  )
}
