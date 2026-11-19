import { PageHeader, TabPanel, Tabs, useTabParam } from '@/components/ui'
import { PositionsTab } from '@/features/trading/PositionsTab'
import { SignalsTab } from '@/features/trading/SignalsTab'
import { usePositions } from '@/queries/usePositions'
import { useTradingSignals } from '@/queries/useTradingSignals'

const TAB_IDS = ['signals', 'positions'] as const

/**
 * Trading (/trading): the trading signals the score produced, with their
 * derived Open/Closed status and return since signal, and the positions taken
 * on them. ?tab=signals|positions keeps the tab on reload; the Positions tab
 * also reads ?institution_id=&direction=&price= to seed the new-position form.
 */
export function Trading() {
  const [tab, setTab] = useTabParam(TAB_IDS)
  const signals = useTradingSignals()
  const positions = usePositions()
  const openCount = positions.data?.filter(
    (position) => position.is_open,
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading"
        description="Short-entry, short-exit and watch signals from the score, and the positions taken on them."
      />
      <Tabs
        aria-label="Trading sections"
        tabs={[
          { id: 'signals', label: 'Signals', count: signals.data?.length },
          { id: 'positions', label: 'Positions', count: openCount },
        ]}
        value={tab}
        onChange={setTab}
      />
      <TabPanel id={tab}>
        {tab === 'signals' ? <SignalsTab /> : <PositionsTab />}
      </TabPanel>
    </div>
  )
}

export default Trading
