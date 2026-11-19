import { describe, expect, it } from 'vitest'
import {
  isWin,
  pctAt,
  pnlAt,
  pnlOf,
  pnlPct,
  summarizeClosed,
  unrealisedOf,
  type PositionLike,
} from './pnl'

const position = (
  overrides: Partial<PositionLike> & Pick<PositionLike, 'direction'>,
): PositionLike => ({
  entry_price: 50,
  exit_price: null,
  shares: 100,
  ...overrides,
})

describe('pnlOf', () => {
  it('a short closed at $0 realises the full notional and is a win', () => {
    const p = position({ direction: 'short', exit_price: 0 })
    expect(pnlOf(p)).toBe(5000)
    expect(pnlPct(p)).toBe(100)
    expect(isWin(pnlOf(p))).toBe(true)
  })

  it('short and long carry opposite signs for the same price move', () => {
    expect(pnlOf(position({ direction: 'short', exit_price: 40 }))).toBe(1000)
    expect(pnlOf(position({ direction: 'long', exit_price: 40 }))).toBe(-1000)
    expect(pnlOf(position({ direction: 'short', exit_price: 60 }))).toBe(-1000)
    expect(pnlOf(position({ direction: 'long', exit_price: 60 }))).toBe(1000)
    expect(pnlPct(position({ direction: 'short', exit_price: 40 }))).toBe(20)
    expect(pnlPct(position({ direction: 'long', exit_price: 40 }))).toBe(-20)
  })

  it('is null while the position has no exit price', () => {
    const open = position({ direction: 'short' })
    expect(pnlOf(open)).toBeNull()
    expect(pnlPct(open)).toBeNull()
    expect(isWin(pnlOf(open))).toBe(false)
  })

  it('breakeven is zero P&L and not a win', () => {
    const flat = position({ direction: 'long', exit_price: 50 })
    expect(pnlOf(flat)).toBe(0)
    expect(pnlPct(flat)).toBe(0)
    expect(isWin(pnlOf(flat))).toBe(false)
  })

  it('guards an entry price of 0: dollar P&L is finite and the percentage is null', () => {
    const zeroEntry = position({
      direction: 'long',
      entry_price: 0,
      exit_price: 5,
    })
    expect(pnlOf(zeroEntry)).toBe(500)
    expect(pnlPct(zeroEntry)).toBeNull()
    expect(pctAt(zeroEntry, 5)).toBeNull()
    expect(Number.isFinite(pnlAt(zeroEntry, 5))).toBe(true)
  })
})

describe('unrealisedOf', () => {
  it('marks an open position to the last price with the direction sign', () => {
    const short = position({ direction: 'short' })
    expect(unrealisedOf(short, 35)).toEqual({ pnl: 1500, pct: 30 })
    expect(unrealisedOf(short, 65)).toEqual({ pnl: -1500, pct: -30 })
    expect(unrealisedOf(position({ direction: 'long' }), 65)).toEqual({
      pnl: 1500,
      pct: 30,
    })
  })

  it('accepts a $0 last price and is null without a price', () => {
    const short = position({ direction: 'short' })
    expect(unrealisedOf(short, 0)).toEqual({ pnl: 5000, pct: 100 })
    expect(unrealisedOf(short, null)).toBeNull()
    expect(unrealisedOf(short, undefined)).toBeNull()
    expect(unrealisedOf(short, Number.NaN)).toBeNull()
  })

  it('returns a null percentage for a 0 entry price', () => {
    expect(
      unrealisedOf(position({ direction: 'long', entry_price: 0 }), 5),
    ).toEqual({ pnl: 500, pct: null })
  })
})

describe('summarizeClosed', () => {
  it('returns nulls, not 0 / 0%, for an empty set', () => {
    expect(summarizeClosed([])).toEqual({
      realised: null,
      winRate: null,
      wins: 0,
      settledCount: 0,
    })
  })

  it('sums realised P&L and counts only strictly positive P&L as wins', () => {
    const summary = summarizeClosed([
      position({ direction: 'short', exit_price: 0 }), // +5000 win
      position({ direction: 'long', exit_price: 50 }), // 0 breakeven, not a win
      position({ direction: 'long', exit_price: 40 }), // -1000 loss
      position({ direction: 'short', exit_price: 45 }), // +500 win
    ])
    expect(summary.realised).toBe(4500)
    expect(summary.settledCount).toBe(4)
    expect(summary.wins).toBe(2)
    expect(summary.winRate).toBe(50)
  })

  it('ignores rows without an exit price instead of counting them as losses', () => {
    const summary = summarizeClosed([
      position({ direction: 'short', exit_price: 0 }),
      position({ direction: 'short' }),
      position({ direction: 'long' }),
    ])
    expect(summary).toEqual({
      realised: 5000,
      winRate: 100,
      wins: 1,
      settledCount: 1,
    })
  })

  it('a set with only breakeven trades has a 0% win rate, not null', () => {
    expect(
      summarizeClosed([position({ direction: 'long', exit_price: 50 })]),
    ).toEqual({ realised: 0, winRate: 0, wins: 0, settledCount: 1 })
  })
})
