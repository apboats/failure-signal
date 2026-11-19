import { BellOff } from 'lucide-react'
import {
  Card,
  EmptyState,
  ListRow,
  ListRows,
  PageState,
  ScoreValue,
} from '@/components/ui'
import { formatDateTimeUTC, formatRelative } from '@/lib/format'
import { useInstitutionIndex } from '@/queries/useInstitutions'
import { useAlertHistory } from '@/queries/useAlerts'
import { BankName } from './AlertList'

/** Newest crossings first; the list is capped, so the count says so. */
const LIMIT = 50

/** Feed of logged threshold crossings (alert_history), newest first. */
export function AlertHistoryList() {
  const history = useAlertHistory(LIMIT)
  const index = useInstitutionIndex()

  if (history.isError) {
    return (
      <PageState
        kind="error"
        title="Could not load alert history"
        error={history.error}
        onRetry={() => void history.refetch()}
        retrying={history.isFetching}
      />
    )
  }
  if (history.isPending) return <PageState kind="loading" skeleton="table" />

  const rows = history.data
  const count = rows.length < LIMIT ? rows.length : `latest ${LIMIT}`

  return (
    <Card title="History" count={count} padded={false}>
      {rows.length === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title="No threshold crossings logged yet."
          body="Active alerts are checked hourly; a crossing appears here and on the Watchlist."
        />
      ) : (
        <ListRows>
          {rows.map((event) => {
            const institution = index.data.get(event.institution_id)
            return (
              <ListRow
                key={event.id}
                to={`/institution/${event.institution_id}`}
                leading={<ScoreValue score={event.triggered_score} />}
                title={
                  <BankName
                    institution={institution}
                    pending={index.isPending}
                  />
                }
                meta={event.trigger_reason ?? 'Threshold crossed'}
                trailing={
                  <time
                    dateTime={event.created_at}
                    title={formatDateTimeUTC(event.created_at, {
                      withDate: true,
                    })}
                    className="text-xs text-muted"
                  >
                    {formatRelative(event.created_at)}
                  </time>
                }
              />
            )
          })}
        </ListRows>
      )}
    </Card>
  )
}
