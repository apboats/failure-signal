import { useId, useState, type FormEvent } from 'react'
import { Button, Delta, DirectionBadge, Field, Input } from '@/components/ui'
import { pctAt, pnlAt } from '@/domain/pnl'
import { formatCount, formatCurrency, formatDate } from '@/lib/format'
import { useLatestScores } from '@/queries/useLatestScores'
import { useClosePosition } from '@/queries/usePositions'
import type { Position } from '@shared/types'
import { PnlCurrency } from './PnlCurrency'
import { isIsoDay, parseNumberInput, todayLocal } from './prefill'

export interface ClosePositionRowProps {
  position: Position
  /** "SIVB" or the bank name, for the heading. */
  bankLabel: string
  /** The row was closed (positions refetched); the caller hides this editor. */
  onDone: () => void
  onCancel: () => void
}

/**
 * Inline confirm row for closing an open position: exit price (0 is valid, a
 * failed bank) and trade date, Confirm/Cancel, disabled while saving, and the
 * write error shown inline instead of a silent close.
 */
export function ClosePositionRow({
  position,
  bankLabel,
  onDone,
  onCancel,
}: ClosePositionRowProps) {
  const id = useId()
  const priceId = `${id}-exit-price`
  const dateId = `${id}-exit-date`
  const scores = useLatestScores().data?.scores
  const mutation = useClosePosition()

  const [exitPrice, setExitPrice] = useState('')
  const [exitDate, setExitDate] = useState(() => todayLocal())
  const [priceError, setPriceError] = useState<string | undefined>()
  const [dateError, setDateError] = useState<string | undefined>()

  const saving = mutation.isPending
  const parsedExit = parseNumberInput(exitPrice)
  const previewPnl =
    parsedExit !== null && parsedExit >= 0 ? pnlAt(position, parsedExit) : null
  const previewPct =
    parsedExit !== null && parsedExit >= 0 ? pctAt(position, parsedExit) : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const exit = parseNumberInput(exitPrice)
    const nextPriceError =
      exit === null || exit < 0
        ? 'Enter an exit price of 0 or more.'
        : undefined
    const nextDateError = isIsoDay(exitDate)
      ? undefined
      : 'Enter the trade date.'
    setPriceError(nextPriceError)
    setDateError(nextDateError)
    if (nextPriceError || nextDateError || exit === null) return
    mutation.mutate(
      {
        id: position.id,
        exit_price: exit,
        exit_date: exitDate,
        exit_score: scores?.get(position.institution_id)?.score ?? null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-text">Close {bankLabel}</h3>
        <DirectionBadge direction={position.direction} size="sm" />
        <span className="text-xs text-muted tabular-nums">
          {formatCount(position.shares)} shares · entry{' '}
          {formatCurrency(position.entry_price, { signed: false })} on{' '}
          {formatDate(position.entry_date)}
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Field
          label="Exit price"
          htmlFor={priceId}
          error={priceError}
          hint={
            previewPnl !== null ? (
              <>
                Realises <PnlCurrency value={previewPnl} />
                {previewPct !== null ? (
                  <>
                    {' '}
                    (<Delta value={previewPct} suffix="%" />)
                  </>
                ) : null}
              </>
            ) : (
              '0 is a valid exit for a failed bank.'
            )
          }
          className="w-full sm:w-40"
        >
          <Input
            id={priceId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={exitPrice}
            invalid={Boolean(priceError)}
            aria-describedby={
              priceError ? `${priceId}-error` : `${priceId}-hint`
            }
            disabled={saving}
            onChange={(event) => setExitPrice(event.target.value)}
          />
        </Field>
        <Field
          label="Exit date"
          htmlFor={dateId}
          error={dateError}
          className="w-full sm:w-44"
        >
          <Input
            id={dateId}
            type="date"
            value={exitDate}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? `${dateId}-error` : undefined}
            disabled={saving}
            onChange={(event) => setExitDate(event.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2 pt-5">
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Confirm close
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
      {mutation.error ? (
        <p role="alert" className="text-sm break-words text-neg">
          Could not close the position: {mutation.error.message}
        </p>
      ) : null}
    </form>
  )
}
