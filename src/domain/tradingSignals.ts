/**
 * Open/Closed status and return-since-signal for trading signals.
 *
 * `trading_signals.is_active` only means "latest of its type per bank" (it is
 * rewritten by daily-snapshot), so it is never used to mean "open". Status is
 * derived here: a short_entry is Closed by the next short_exit for the same
 * bank with a later created_at, and Open until one exists. short_exit and
 * watch rows are not positions, so their status is 'n/a'.
 */
import type { TradingSignal } from '@shared/types'

export type SignalStatus = 'open' | 'closed' | 'n/a'

/** The columns deriveSignalStatus reads; a full TradingSignal row qualifies. */
export type SignalLike = Pick<
  TradingSignal,
  'id' | 'institution_id' | 'signal_type' | 'price_at_signal' | 'created_at'
>

/** Where the price the return is measured against came from. */
export type MarkSource = 'exit' | 'latest'

export interface SignalOutcome<S extends SignalLike = SignalLike> {
  status: SignalStatus
  /** The short_exit that closed this short_entry (status 'closed' only). */
  exitSignal?: S
  /**
   * Price the short return is measured against: the closing exit's
   * price_at_signal, or the newest priced snapshot while open. Null when
   * that price is unknown.
   */
  markPrice: number | null
  markSource?: MarkSource
  /**
   * Short return in percent, (price_at_signal − mark) / price_at_signal × 100.
   * Positive means the short worked. Null when either price is null.
   */
  returnPct: number | null
}

const NOT_APPLICABLE: SignalOutcome<never> = {
  status: 'n/a',
  markPrice: null,
  returnPct: null,
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Milliseconds for a created_at timestamp. PostgREST writes six fractional
 * digits ('…10.132667+00:00'), which Date.parse accepts; an unparseable value
 * falls back to a string compare so ordering is still deterministic.
 */
function signalTime(createdAt: string): number {
  const ms = Date.parse(createdAt)
  return Number.isNaN(ms) ? Number.NaN : ms
}

function isLater(a: string, b: string): boolean {
  const ta = signalTime(a)
  const tb = signalTime(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b
  return ta > tb
}

function compareTime(a: string, b: string): number {
  const ta = signalTime(a)
  const tb = signalTime(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a < b ? -1 : a > b ? 1 : 0
  return ta - tb
}

/**
 * Short return in percent for a short entered at `entryPrice` and marked at
 * `markPrice`. Null when either price is missing or the entry price is not
 * positive (a 0 entry would divide by zero).
 */
export function shortReturnPct(
  entryPrice: number | null | undefined,
  markPrice: number | null | undefined,
): number | null {
  if (!isPrice(entryPrice) || entryPrice <= 0 || !isPrice(markPrice))
    return null
  return ((entryPrice - markPrice) / entryPrice) * 100
}

/**
 * Status, mark price and return for every signal, keyed by signal id.
 *
 * - short_entry: 'closed' when a short_exit for the same institution has a
 *   strictly later created_at (the earliest such exit closes it; several
 *   entries can share one exit); otherwise 'open', marked at the latest priced
 *   snapshot from `latestPrices` (missing entry → markPrice null).
 * - short_exit / watch: 'n/a' with no return.
 *
 * Pure: input order does not matter and nothing is mutated.
 */
export function deriveSignalStatus<S extends SignalLike>(
  signals: readonly S[],
  latestPrices: ReadonlyMap<string, { price: number }>,
): Map<string, SignalOutcome<S>> {
  const exitsByInstitution = new Map<string, S[]>()
  for (const signal of signals) {
    if (signal.signal_type !== 'short_exit') continue
    const list = exitsByInstitution.get(signal.institution_id)
    if (list) list.push(signal)
    else exitsByInstitution.set(signal.institution_id, [signal])
  }
  for (const list of exitsByInstitution.values())
    list.sort((a, b) => compareTime(a.created_at, b.created_at))

  const outcomes = new Map<string, SignalOutcome<S>>()
  for (const signal of signals) {
    if (signal.signal_type !== 'short_entry') {
      outcomes.set(signal.id, NOT_APPLICABLE)
      continue
    }
    const exit = exitsByInstitution
      .get(signal.institution_id)
      ?.find((candidate) => isLater(candidate.created_at, signal.created_at))
    if (exit) {
      const markPrice = isPrice(exit.price_at_signal)
        ? exit.price_at_signal
        : null
      outcomes.set(signal.id, {
        status: 'closed',
        exitSignal: exit,
        markPrice,
        markSource: 'exit',
        returnPct: shortReturnPct(signal.price_at_signal, markPrice),
      })
      continue
    }
    const latest = latestPrices.get(signal.institution_id)
    const markPrice = latest && isPrice(latest.price) ? latest.price : null
    outcomes.set(signal.id, {
      status: 'open',
      markPrice,
      markSource: 'latest',
      returnPct: shortReturnPct(signal.price_at_signal, markPrice),
    })
  }
  return outcomes
}

/** How many signals are open / closed / n/a (for tab counts and toolbars). */
export function countByStatus(
  outcomes: ReadonlyMap<string, SignalOutcome>,
): Record<SignalStatus, number> {
  const counts: Record<SignalStatus, number> = { open: 0, closed: 0, 'n/a': 0 }
  for (const outcome of outcomes.values()) counts[outcome.status] += 1
  return counts
}
