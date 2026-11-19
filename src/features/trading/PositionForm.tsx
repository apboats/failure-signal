import { TrendingDown, TrendingUp } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  Field,
  Input,
  SegmentedControl,
  Select,
  Textarea,
  type SegmentedOption,
} from '@/components/ui'
import { formatCurrency } from '@/lib/format'
import { useInstitutionIndex } from '@/queries/useInstitutions'
import { useLatestScores } from '@/queries/useLatestScores'
import { useOpenPosition } from '@/queries/usePositions'
import type { Institution, PositionDirection } from '@shared/types'
import {
  isIsoDay,
  parseNumberInput,
  todayLocal,
  type PositionPrefill,
} from './prefill'

export interface PositionFormProps {
  /** Values from ?institution_id=&direction=&price= (empty object when none). */
  prefill: PositionPrefill
  /** Active banks for the Select (an inactive prefilled bank is added as its own option). */
  institutions: readonly Institution[]
  /** The row is on screen (positions refetched); the caller closes the form. */
  onDone: () => void
  onCancel: () => void
}

interface FieldErrors {
  institution?: string
  price?: string
  shares?: string
  date?: string
}

const DIRECTION_OPTIONS: readonly SegmentedOption<PositionDirection>[] = [
  { value: 'short', label: 'Short', icon: <TrendingDown /> },
  { value: 'long', label: 'Long', icon: <TrendingUp /> },
]

function validate(values: {
  institutionId: string
  price: string
  shares: string
  date: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.institutionId) errors.institution = 'Choose a bank.'
  const price = parseNumberInput(values.price)
  if (price === null || price <= 0)
    errors.price = 'Enter an entry price greater than 0.'
  const shares = parseNumberInput(values.shares)
  if (shares === null || shares <= 0)
    errors.shares = 'Enter a share count greater than 0.'
  if (!isIsoDay(values.date)) errors.date = 'Enter the trade date.'
  return errors
}

/**
 * New position form. Validates before any network call, keeps every value on
 * failure and shows the write error verbatim (RLS, missing column, network)
 * instead of closing as if it had saved.
 */
export function PositionForm({
  prefill,
  institutions,
  onDone,
  onCancel,
}: PositionFormProps) {
  const id = useId()
  const ids = {
    institution: `${id}-institution`,
    price: `${id}-price`,
    shares: `${id}-shares`,
    date: `${id}-date`,
    notes: `${id}-notes`,
  }
  const index = useInstitutionIndex().data
  const scores = useLatestScores().data?.scores
  const mutation = useOpenPosition()

  const [institutionId, setInstitutionId] = useState(
    prefill.institutionId ?? '',
  )
  const [direction, setDirection] = useState<PositionDirection>(
    prefill.direction ?? 'short',
  )
  const [price, setPrice] = useState(
    prefill.price !== undefined ? String(prefill.price) : '',
  )
  const [shares, setShares] = useState('')
  const [date, setDate] = useState(() => todayLocal())
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  /** Active banks plus the prefilled one when it is inactive, so a deep link is never silently dropped. */
  const options = useMemo(() => {
    const list = [...institutions]
    const prefilled = prefill.institutionId
      ? index.get(prefill.institutionId)
      : undefined
    if (prefilled && !list.some((inst) => inst.id === prefilled.id))
      list.push(prefilled)
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [institutions, index, prefill.institutionId])

  const saving = mutation.isPending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const nextErrors = validate({ institutionId, price, shares, date })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const entryPrice = parseNumberInput(price)
    const shareCount = parseNumberInput(shares)
    if (entryPrice === null || shareCount === null) return
    const trimmedNotes = notes.trim()
    mutation.mutate(
      {
        institution_id: institutionId,
        direction,
        entry_price: entryPrice,
        entry_date: date,
        entry_score: scores?.get(institutionId)?.score ?? null,
        shares: shareCount,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      },
      { onSuccess: onDone },
    )
  }

  const writeError = mutation.error

  return (
    <Card title="New position">
      <form noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Bank"
            htmlFor={ids.institution}
            error={errors.institution}
          >
            <Select
              id={ids.institution}
              value={institutionId}
              invalid={Boolean(errors.institution)}
              aria-describedby={
                errors.institution ? `${ids.institution}-error` : undefined
              }
              disabled={saving}
              onChange={(event) => setInstitutionId(event.target.value)}
            >
              <option value="">Choose a bank</option>
              {options.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                  {inst.ticker ? ` (${inst.ticker})` : ''}
                  {inst.is_active ? '' : ' · inactive'}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted">
              Direction
            </span>
            <SegmentedControl
              aria-label="Direction"
              options={DIRECTION_OPTIONS}
              value={direction}
              onChange={setDirection}
            />
          </div>
          <Field
            label="Entry price"
            htmlFor={ids.price}
            error={errors.price}
            hint={
              prefill.price !== undefined
                ? `Seeded from the signal: ${formatCurrency(prefill.price, { signed: false })}`
                : undefined
            }
          >
            <Input
              id={ids.price}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={price}
              invalid={Boolean(errors.price)}
              aria-describedby={
                errors.price
                  ? `${ids.price}-error`
                  : prefill.price !== undefined
                    ? `${ids.price}-hint`
                    : undefined
              }
              disabled={saving}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
          <Field label="Shares" htmlFor={ids.shares} error={errors.shares}>
            <Input
              id={ids.shares}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="100"
              value={shares}
              invalid={Boolean(errors.shares)}
              aria-describedby={
                errors.shares ? `${ids.shares}-error` : undefined
              }
              disabled={saving}
              onChange={(event) => setShares(event.target.value)}
            />
          </Field>
          <Field
            label="Trade date"
            htmlFor={ids.date}
            error={errors.date}
            hint="Defaults to today in your time zone."
          >
            <Input
              id={ids.date}
              type="date"
              value={date}
              invalid={Boolean(errors.date)}
              aria-describedby={
                errors.date ? `${ids.date}-error` : `${ids.date}-hint`
              }
              disabled={saving}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor={ids.notes} className="md:col-span-2">
            <Textarea
              id={ids.notes}
              value={notes}
              placeholder="Thesis, source, anything to remember at exit"
              disabled={saving}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        {writeError ? (
          <p role="alert" className="text-sm break-words text-neg">
            Could not open the position: {writeError.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={saving}>
            Open position
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
