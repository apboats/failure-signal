import { useMemo } from 'react'
import {
  PageHeader,
  PageState,
  TabPanel,
  Tabs,
  useTabParam,
  type TabItem,
} from '@/components/ui'
import { buildBenchmarkIndex } from '@/domain/analytics/benchmark'
import {
  computeDataWindow,
  toTradingDaySeries,
} from '@/domain/analytics/series'
import { DataWindowBar } from '@/features/validation/DataWindowBar'
import { EventStudyTab } from '@/features/validation/EventStudyTab'
import { LeadLagTab } from '@/features/validation/LeadLagTab'
import { sinceForRange, useRangeParam } from '@/features/validation/range'
import { useInstitutionIndex } from '@/queries/useInstitutions'
import { useBenchmarks, usePricedSnapshots } from '@/queries/useSnapshots'

const TAB_IDS = ['events', 'leadlag'] as const
type TabId = (typeof TAB_IDS)[number]

const TABS: readonly TabItem<TabId>[] = [
  { id: 'events', label: 'Event study' },
  { id: 'leadlag', label: 'Lead-lag' },
]

/**
 * Validation: does the score lead price? Merges the old Backtest (event
 * study) and Score vs Price (lead-lag) pages over the same paged snapshot
 * window. Statistics live in src/domain/analytics; this page only fetches,
 * narrows the rows to active banks and trading days, and composes the tabs.
 */
export function Validation() {
  const [tab, setTab] = useTabParam(TAB_IDS)
  const [range, setRange] = useRangeParam()
  const since = useMemo(() => sinceForRange(range), [range])

  const snapshots = usePricedSnapshots(since)
  const benchmarks = useBenchmarks(since)
  const institutions = useInstitutionIndex()

  const dataWindow = useMemo(
    () =>
      snapshots.data && institutions.isSuccess
        ? computeDataWindow(snapshots.data, institutions.data)
        : null,
    [snapshots.data, institutions.isSuccess, institutions.data],
  )
  const tradingDays = useMemo(
    () => (dataWindow ? toTradingDaySeries(dataWindow.rows) : null),
    [dataWindow],
  )
  const benchmarkIndex = useMemo(
    () => buildBenchmarkIndex(benchmarks.data ?? []),
    [benchmarks.data],
  )

  const error = snapshots.error ?? benchmarks.error ?? institutions.error
  const pending =
    snapshots.isPending || benchmarks.isPending || institutions.isPending
  const fetching =
    snapshots.isFetching || benchmarks.isFetching || institutions.isFetching
  const retry = () => {
    void snapshots.refetch()
    void benchmarks.refetch()
    void institutions.refetch()
  }

  let body
  if (error) {
    body = (
      <PageState
        kind="error"
        error={error}
        onRetry={retry}
        retrying={fetching}
      />
    )
  } else if (pending || !dataWindow || !tradingDays) {
    body = <PageState kind="loading" skeleton="table" />
  } else if (dataWindow.rows.length === 0) {
    body = (
      <PageState
        kind="empty"
        title="No priced snapshots in this range."
        message="The daily snapshot job writes one priced row per active bank per trading day. Widen the range to include some."
      />
    )
  } else {
    body = (
      <TabPanel id={tab}>
        {tab === 'events' ? (
          <EventStudyTab
            series={tradingDays.series}
            benchmarks={benchmarkIndex}
            institutions={institutions.data}
          />
        ) : (
          <LeadLagTab
            series={tradingDays.series}
            institutions={institutions.data}
          />
        )}
      </TabPanel>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation"
        description="Does the score lead price? Event study and lead-lag over daily snapshots."
        right={
          <DataWindowBar
            range={range}
            onRangeChange={setRange}
            dataWindow={error ? null : dataWindow}
          />
        }
      />
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        aria-label="Validation sections"
      />
      {body}
    </div>
  )
}

export default Validation
