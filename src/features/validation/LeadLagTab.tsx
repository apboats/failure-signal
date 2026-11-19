import { useMemo, useState } from 'react'
import {
  buildChartSeries,
  computeLeadLag,
  DEFAULT_MIN_OBSERVATIONS,
} from '@/domain/analytics/leadLag'
import type { BankSeries } from '@/domain/analytics/series'
import type { Institution } from '@shared/types'
import { DEFAULT_LAG, type LagDays } from './controls'
import { LeadLagChart } from './LeadLagChart'
import { LeadLagControls } from './LeadLagControls'
import { LeadLagTable, type LeadLagTableRow } from './LeadLagTable'

export interface LeadLagTabProps {
  series: BankSeries
  institutions: ReadonlyMap<string, Institution>
}

/** Lead-lag tab: controls, the per-bank table and the chart of the selected bank. */
export function LeadLagTab({ series, institutions }: LeadLagTabProps) {
  const [lagDays, setLagDays] = useState<LagDays>(DEFAULT_LAG)
  const [minObs, setMinObs] = useState(DEFAULT_MIN_OBSERVATIONS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo<LeadLagTableRow[]>(
    () =>
      computeLeadLag(series, lagDays, minObs).map((row) => {
        const institution = institutions.get(row.institutionId)
        return {
          ...row,
          name: institution?.name ?? 'Unknown bank',
          ticker: institution?.ticker ?? null,
        }
      }),
    [series, lagDays, minObs, institutions],
  )
  const selected =
    selectedId === null ? null : (institutions.get(selectedId) ?? null)
  const points = useMemo(
    () =>
      selectedId === null ? [] : buildChartSeries(series.get(selectedId) ?? []),
    [series, selectedId],
  )

  return (
    <>
      <LeadLagControls
        lagDays={lagDays}
        onLagChange={setLagDays}
        minObs={minObs}
        onMinObsChange={setMinObs}
      />
      <LeadLagTable
        rows={rows}
        lagDays={lagDays}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <LeadLagChart
        points={points}
        name={selected?.name ?? null}
        ticker={selected?.ticker ?? null}
      />
    </>
  )
}
