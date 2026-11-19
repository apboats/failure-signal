import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, PageHeader } from '@/components/ui'
import { AlertForm } from '@/features/alerts/AlertForm'
import { AlertHistoryList } from '@/features/alerts/AlertHistoryList'
import { AlertList } from '@/features/alerts/AlertList'

const PREFILL_PARAM = 'institution_id'

/**
 * /alerts: threshold alerts, in-app only. Opens the form when the URL carries
 * ?institution_id= (the detail page's "Create alert" link); closing the form
 * drops that param so a reload does not reopen it.
 */
export function Alerts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const prefill = searchParams.get(PREFILL_PARAM)
  const [requested, setRequested] = useState(false)
  const formOpen = requested || prefill !== null

  const openForm = () => setRequested(true)
  const closeForm = () => {
    setRequested(false)
    if (prefill !== null) {
      const next = new URLSearchParams(searchParams)
      next.delete(PREFILL_PARAM)
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Log an event when a bank's score crosses a threshold. Events appear here and on the Watchlist."
        right={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={openForm}
            disabled={formOpen}
            aria-expanded={formOpen}
            aria-controls="new-alert-form"
          >
            New alert
          </Button>
        }
      />
      {formOpen ? (
        <AlertForm
          key={prefill ?? 'new'}
          initialInstitutionId={prefill ?? undefined}
          onClose={closeForm}
        />
      ) : null}
      <AlertList onNew={openForm} />
      <AlertHistoryList />
    </div>
  )
}
