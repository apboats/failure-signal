import { X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { QueryError } from '@/lib/fetchAll'
import { formatScore } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  cx,
  Field,
  Range,
  ScoreValue,
  Select,
} from '@/components/ui'
import {
  categoryColor,
  categoryLabel,
  SIGNAL_CATEGORY_KEYS,
} from '@/domain/signals'
import { useInstitutions } from '@/queries/useInstitutions'
import { useCreateAlert } from '@/queries/useAlerts'
import { SEVERE, WATCH } from '@shared/thresholds'
import type { Institution, SignalCategory } from '@shared/types'

export interface AlertFormValues {
  /** '' until a bank is chosen. */
  institutionId: string
  /** Integer in [1, SEVERE]. */
  threshold: number
  /** Empty = fire on any category. */
  categories: SignalCategory[]
}

/** The category colour as a small dot next to its label (design brief §6: never a background). */
export function CategoryDot({ category }: { category: SignalCategory }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColor(category) }}
    />
  )
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return WATCH
  return Math.min(SEVERE, Math.max(1, Math.round(value)))
}

function institutionOptionLabel(institution: Institution): string {
  const ticker = institution.ticker ? ` (${institution.ticker})` : ''
  const inactive = institution.is_active ? '' : ' · inactive'
  return `${institution.name}${ticker}${inactive}`
}

export interface AlertFormViewProps {
  values: AlertFormValues
  onChange: (patch: Partial<AlertFormValues>) => void
  /** Banks offered in the Select (active ones, plus a prefilled inactive one). */
  institutions: readonly Institution[]
  institutionsPending: boolean
  institutionsError: Error | null
  saving: boolean
  /** The rejected mutation error; rendered verbatim with the values kept. */
  error: Error | null
  onSubmit: () => void
  onClose: () => void
}

/** The form itself, free of data hooks so its states can be rendered directly. */
export function AlertFormView({
  values,
  onChange,
  institutions,
  institutionsPending,
  institutionsError,
  saving,
  error,
  onSubmit,
  onClose,
}: AlertFormViewProps) {
  const canSubmit = values.institutionId !== '' && !saving
  const selectedCount = values.categories.length

  const toggleCategory = (category: SignalCategory) => {
    const next = values.categories.includes(category)
      ? values.categories.filter((c) => c !== category)
      : [...values.categories, category]
    onChange({ categories: next })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <Card
      id="new-alert-form"
      title="New alert"
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={<X />}
          aria-label="Close form"
          onClick={onClose}
        />
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Bank"
          htmlFor="alert-institution"
          error={institutionsError ? institutionsError.message : undefined}
        >
          <Select
            id="alert-institution"
            value={values.institutionId}
            required
            disabled={institutionsPending}
            invalid={institutionsError !== null}
            aria-describedby={
              institutionsError ? 'alert-institution-error' : undefined
            }
            onChange={(event) =>
              onChange({ institutionId: event.target.value })
            }
            className="md:max-w-md"
          >
            <option value="">Choose a bank</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institutionOptionLabel(institution)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Threshold"
          htmlFor="threshold"
          hint="Logs an event here and on the Watchlist when the score crosses the threshold."
        >
          <Range
            id="threshold"
            value={values.threshold}
            min={1}
            max={SEVERE}
            step={1}
            format={formatScore}
            aria-describedby="threshold-hint"
            onValueChange={(value) =>
              onChange({ threshold: clampThreshold(value) })
            }
            className="md:max-w-md"
          />
          <p className="flex items-center gap-2 text-xs text-muted">
            <span>Fires at</span>
            <ScoreValue score={values.threshold} withLevel />
          </p>
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted">Categories</legend>
          <div className="flex flex-wrap gap-2">
            {SIGNAL_CATEGORY_KEYS.map((category) => {
              const selected = values.categories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCategory(category)}
                  className={cx(
                    'focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'bg-accent text-white'
                      : 'bg-surface-2 text-muted hover:text-text',
                  )}
                >
                  <CategoryDot category={category} />
                  {categoryLabel(category)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted">
            {selectedCount === 0
              ? 'All categories: fires on any signal that moves the score.'
              : `${selectedCount} of ${SIGNAL_CATEGORY_KEYS.length} categories: fires only when one of these is among the latest signals.`}
          </p>
        </fieldset>

        {error ? (
          <div role="alert" className="space-y-1 text-sm text-neg">
            <p className="break-words">
              <span className="font-medium">Could not create alert.</span>{' '}
              {error.message}
            </p>
            {error instanceof QueryError && (error.details || error.hint) ? (
              <p className="text-xs break-words text-muted">
                {[error.code, error.details, error.hint]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={!canSubmit}
          >
            Create alert
          </Button>
        </div>
      </form>
    </Card>
  )
}

export interface AlertFormProps {
  /** From ?institution_id=; the Select starts on this bank. */
  initialInstitutionId?: string
  onClose: () => void
  /** Runs after the insert succeeds and the list has been invalidated. */
  onCreated?: () => void
}

/**
 * Create-alert form. In-app only: the insert never sets notify_email or
 * user_id (single-tenant, no auth). A failed insert keeps every value and
 * shows the PostgREST message inline.
 */
export function AlertForm({
  initialInstitutionId,
  onClose,
  onCreated,
}: AlertFormProps) {
  const institutionsQuery = useInstitutions()
  const create = useCreateAlert()
  const [values, setValues] = useState<AlertFormValues>(() => ({
    institutionId: initialInstitutionId ?? '',
    threshold: WATCH,
    categories: [],
  }))

  // Active banks are the normal choices; a prefilled inactive bank stays
  // selectable so a deep link from its detail page still works.
  const institutions = useMemo(() => {
    const all = institutionsQuery.data ?? []
    return all.filter(
      (institution) =>
        institution.is_active || institution.id === initialInstitutionId,
    )
  }, [institutionsQuery.data, initialInstitutionId])

  const handleSubmit = () => {
    if (values.institutionId === '') return
    create.mutate(
      {
        institution_id: values.institutionId,
        threshold_score: clampThreshold(values.threshold),
        signal_categories:
          values.categories.length > 0 ? values.categories : null,
        notify_in_app: true,
        notify_email: false,
        is_active: true,
      },
      {
        onSuccess: () => {
          onCreated?.()
          onClose()
        },
      },
    )
  }

  return (
    <AlertFormView
      values={values}
      onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
      institutions={institutions}
      institutionsPending={institutionsQuery.isPending}
      institutionsError={institutionsQuery.error}
      saving={create.isPending}
      error={create.error}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}

/** Human summary of a stored category filter: the chips, or "All categories". */
export function CategoryChips({
  categories,
}: {
  categories: readonly string[] | null | undefined
}) {
  const known = (categories ?? []).filter((value): value is SignalCategory =>
    (SIGNAL_CATEGORY_KEYS as readonly string[]).includes(value),
  )
  if (known.length === 0) {
    return (
      <Badge tone="neutral" size="sm">
        All categories
      </Badge>
    )
  }
  return (
    <>
      {known.map((category) => (
        <Badge
          key={category}
          tone="neutral"
          size="sm"
          icon={<CategoryDot category={category} />}
        >
          {categoryLabel(category)}
        </Badge>
      ))}
    </>
  )
}
