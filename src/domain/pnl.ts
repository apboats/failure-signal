/**
 * Position P&L. A $0 exit is a valid exit (a short closed on a bank failure is
 * the trade this app exists for), so "no exit" is `exit_price == null`, never
 * `!exit_price`. Breakeven is not a win. Percentages are return on notional
 * (per-share P&L over entry price), not return on margin.
 */
import type { Position } from '@shared/types'

/** The columns the P&L functions read; a full Position row qualifies. */
export type PositionLike = Pick<
  Position,
  'direction' | 'entry_price' | 'exit_price' | 'shares'
>

type OpenLeg = Pick<PositionLike, 'direction' | 'entry_price' | 'shares'>

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Per-share profit if the position were closed at `exitPrice` (sign follows the direction). */
function perShareAt(position: OpenLeg, exitPrice: number): number {
  return position.direction === 'short'
    ? position.entry_price - exitPrice
    : exitPrice - position.entry_price
}

/** Dollar P&L for closing the whole position at `exitPrice`. */
export function pnlAt(position: OpenLeg, exitPrice: number): number {
  return perShareAt(position, exitPrice) * position.shares
}

/**
 * Return on notional in percent for closing at `exitPrice`; null when the
 * entry price is not positive (division by zero) or the exit is not a number.
 */
export function pctAt(position: OpenLeg, exitPrice: number): number | null {
  if (!isFiniteNumber(exitPrice)) return null
  if (!isFiniteNumber(position.entry_price) || position.entry_price <= 0)
    return null
  return (perShareAt(position, exitPrice) / position.entry_price) * 100
}

/** Realised dollar P&L; null while the position has no exit price (a $0 exit counts). */
export function pnlOf(position: PositionLike): number | null {
  return isFiniteNumber(position.exit_price)
    ? pnlAt(position, position.exit_price)
    : null
}

/** Realised return on notional in percent; null without an exit or with a non-positive entry price. */
export function pnlPct(position: PositionLike): number | null {
  return isFiniteNumber(position.exit_price)
    ? pctAt(position, position.exit_price)
    : null
}

/** A win is strictly positive P&L; breakeven and null are not wins. */
export function isWin(pnl: number | null | undefined): boolean {
  return isFiniteNumber(pnl) && pnl > 0
}

export interface UnrealisedPnl {
  pnl: number
  /** Return on notional in percent; null when the entry price is not positive. */
  pct: number | null
}

/** Mark-to-market P&L of an open position at `lastPrice`; null when there is no price. */
export function unrealisedOf(
  position: OpenLeg,
  lastPrice: number | null | undefined,
): UnrealisedPnl | null {
  if (!isFiniteNumber(lastPrice)) return null
  return { pnl: pnlAt(position, lastPrice), pct: pctAt(position, lastPrice) }
}

export interface ClosedSummary {
  /** Sum of realised P&L over settled positions; null when none are settled. */
  realised: number | null
  /** Wins / settled × 100; null when none are settled (never "0%" for an empty book). */
  winRate: number | null
  wins: number
  /** Closed positions that carry an exit price (the only ones that can be summed). */
  settledCount: number
}

/**
 * Realised P&L and win rate over the positions that have an exit price. Pass
 * the closed set; rows without an exit price are ignored rather than counted
 * as losses.
 */
export function summarizeClosed(
  positions: readonly PositionLike[],
): ClosedSummary {
  let realised = 0
  let wins = 0
  let settledCount = 0
  for (const position of positions) {
    const pnl = pnlOf(position)
    if (pnl === null) continue
    settledCount += 1
    realised += pnl
    if (isWin(pnl)) wins += 1
  }
  if (settledCount === 0)
    return { realised: null, winRate: null, wins: 0, settledCount: 0 }
  return {
    realised,
    winRate: (wins / settledCount) * 100,
    wins,
    settledCount,
  }
}
