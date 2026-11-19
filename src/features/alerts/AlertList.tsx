import { Bell, CircleAlert, Pause, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  ListRows,
  PageState,
  ScoreValue,
  Skeleton,
} from '@/components/ui'
import { useInstitutionIndex } from '@/queries/useInstitutions'
import { useAlerts, useDeleteAlert, useToggleAlert } from '@/queries/useAlerts'
import type { AlertConfig, Institution } from '@shared/types'
import { CategoryChips } from './AlertForm'

export interface AlertListProps {
  /** Wires the "New alert" action of the empty state. */
  onNew?: () => void
}

/** Bank name, ticker and an Inactive tag; a skeleton while the index loads. */
export function BankName({
  institution,
  pending,
}: {
  institution: Institution | undefined
  pending: boolean
}) {
  if (pending && !institution) return <Skeleton inline className="h-4 w-32" />
  if (!institution) return <span>Unknown bank</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{institution.name}</span>
      {institution.ticker ? (
        <span className="text-xs text-muted">{institution.ticker}</span>
      ) : null}
      {!institution.is_active ? (
        <Badge tone="neutral" size="sm">
          Inactive
        </Badge>
      ) : null}
    </span>
  )
}

function bankLabel(institution: Institution | undefined): string {
  if (!institution) return 'this bank'
  return institution.ticker ?? institution.name
}

/**
 * Configured alerts with Pause/Resume and Delete. Every mutation failure is
 * rendered at the top of the card (role="alert"), never only in the console.
 */
export function AlertList({ onNew }: AlertListProps) {
  const alerts = useAlerts()
  const index = useInstitutionIndex()
  const toggle = useToggleAlert()
  const remove = useDeleteAlert()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (alerts.isError) {
    return (
      <PageState
        kind="error"
        title="Could not load alerts"
        error={alerts.error}
        onRetry={() => void alerts.refetch()}
        retrying={alerts.isFetching}
      />
    )
  }
  if (alerts.isPending) return <PageState kind="loading" skeleton="table" />

  const rows: AlertConfig[] = alerts.data
  const failures = [
    { label: 'Could not update alert.', error: toggle.error },
    { label: 'Could not delete alert.', error: remove.error },
  ].filter((f) => f.error !== null)

  return (
    <Card title="Alerts" count={rows.length} padded={false}>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No alerts yet."
          body="An alert logs an event when a bank's score crosses its threshold."
          action={
            onNew ? (
              <Button variant="primary" size="sm" onClick={onNew}>
                New alert
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {failures.length > 0 ? (
            <div role="alert" className="space-y-1 px-4 py-3 md:px-5">
              {failures.map((failure) => (
                <p
                  key={failure.label}
                  className="flex items-start gap-2 text-sm break-words text-neg"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    <span className="font-medium">{failure.label}</span>{' '}
                    {failure.error?.message}
                  </span>
                </p>
              ))}
            </div>
          ) : null}
          <ListRows>
            {rows.map((config) => {
              const institution = index.data.get(config.institution_id)
              const label = bankLabel(institution)
              const confirming = confirmId === config.id
              const toggling =
                toggle.isPending && toggle.variables?.id === config.id
              const removing =
                remove.isPending && remove.variables === config.id
              return (
                <ListRow
                  key={config.id}
                  title={
                    <Link
                      to={`/institution/${config.institution_id}`}
                      className="focus-ring rounded hover:underline"
                    >
                      <BankName
                        institution={institution}
                        pending={index.isPending}
                      />
                    </Link>
                  }
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        Threshold
                        <ScoreValue score={config.threshold_score} />
                      </span>
                      <CategoryChips categories={config.signal_categories} />
                    </span>
                  }
                  trailing={
                    confirming ? (
                      <>
                        <span className="text-xs text-muted">
                          Delete this alert and its history?
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={removing}
                          onClick={() =>
                            remove.mutate(config.id, {
                              onSuccess: () => setConfirmId(null),
                            })
                          }
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removing}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge tone={config.is_active ? 'accent' : 'neutral'}>
                          {config.is_active ? 'Active' : 'Paused'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={config.is_active ? <Pause /> : <Play />}
                          aria-label={
                            config.is_active
                              ? `Pause alert for ${label}`
                              : `Resume alert for ${label}`
                          }
                          loading={toggling}
                          onClick={() =>
                            toggle.mutate({
                              id: config.id,
                              is_active: !config.is_active,
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 />}
                          aria-label={`Delete alert for ${label}`}
                          onClick={() => setConfirmId(config.id)}
                        />
                      </>
                    )
                  }
                />
              )
            })}
          </ListRows>
        </div>
      )}
    </Card>
  )
}
