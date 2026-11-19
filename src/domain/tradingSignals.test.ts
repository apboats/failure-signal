import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  deriveSignalStatus,
  shortReturnPct,
  type SignalLike,
} from './tradingSignals'

const BANK_A = 'bank-a'
const BANK_B = 'bank-b'

let seq = 0
const signal = (
  overrides: Partial<SignalLike> & Pick<SignalLike, 'signal_type'>,
): SignalLike => ({
  id: `sig-${++seq}`,
  institution_id: BANK_A,
  price_at_signal: 100,
  created_at: '2026-06-01T22:00:10.132667+00:00',
  ...overrides,
})

const prices = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, price]) => [id, { price }]))

describe('shortReturnPct', () => {
  it('is positive when the price fell after the short', () => {
    expect(shortReturnPct(100, 80)).toBe(20)
    expect(shortReturnPct(100, 120)).toBe(-20)
    expect(shortReturnPct(50, 0)).toBe(100)
  })

  it('is null when either price is missing or the entry is not positive', () => {
    expect(shortReturnPct(null, 80)).toBeNull()
    expect(shortReturnPct(100, null)).toBeNull()
    expect(shortReturnPct(0, 80)).toBeNull()
    expect(shortReturnPct(Number.NaN, 80)).toBeNull()
  })
})

describe('deriveSignalStatus', () => {
  it('closes a short_entry with the next short_exit for the same bank and measures the return at the exit price', () => {
    const entry = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
      price_at_signal: 100,
    })
    const exit = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-10T22:00:00+00:00',
      price_at_signal: 70,
    })
    const out = deriveSignalStatus([exit, entry], prices({ [BANK_A]: 10 }))
    const entryOutcome = out.get(entry.id)
    expect(entryOutcome?.status).toBe('closed')
    expect(entryOutcome?.exitSignal?.id).toBe(exit.id)
    expect(entryOutcome?.markPrice).toBe(70)
    expect(entryOutcome?.markSource).toBe('exit')
    expect(entryOutcome?.returnPct).toBe(30)
    expect(out.get(exit.id)).toMatchObject({
      status: 'n/a',
      returnPct: null,
    })
  })

  it('leaves a short_entry open when the only exits are earlier, for another bank, or absent, marking it at the latest price', () => {
    const earlierExit = signal({
      signal_type: 'short_exit',
      created_at: '2026-05-20T22:00:00+00:00',
    })
    const otherBankExit = signal({
      signal_type: 'short_exit',
      institution_id: BANK_B,
      created_at: '2026-06-20T22:00:00+00:00',
    })
    const entry = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
      price_at_signal: 100,
    })
    const out = deriveSignalStatus(
      [earlierExit, otherBankExit, entry],
      prices({ [BANK_A]: 125 }),
    )
    expect(out.get(entry.id)).toMatchObject({
      status: 'open',
      markPrice: 125,
      markSource: 'latest',
      returnPct: -25,
    })
    expect(out.get(entry.id)?.exitSignal).toBeUndefined()
  })

  it('does not use is_active or an exit at the same instant; a strictly later exit is required', () => {
    const entry = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
    })
    const sameInstant = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-01T22:00:00+00:00',
    })
    const out = deriveSignalStatus([entry, sameInstant], prices({}))
    expect(out.get(entry.id)?.status).toBe('open')
  })

  it('picks the earliest later exit and lets several entries share it', () => {
    const entry1 = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
      price_at_signal: 100,
    })
    const entry2 = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-03T22:00:00+00:00',
      price_at_signal: 90,
    })
    const firstExit = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-05T22:00:00+00:00',
      price_at_signal: 80,
    })
    const laterExit = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-09T22:00:00+00:00',
      price_at_signal: 10,
    })
    const out = deriveSignalStatus(
      [laterExit, entry2, firstExit, entry1],
      prices({}),
    )
    expect(out.get(entry1.id)?.exitSignal?.id).toBe(firstExit.id)
    expect(out.get(entry1.id)?.returnPct).toBe(20)
    expect(out.get(entry2.id)?.exitSignal?.id).toBe(firstExit.id)
    expect(out.get(entry2.id)?.returnPct).toBeCloseTo(11.111, 3)
  })

  it('returns null (rendered as n/a) when the entry, exit or latest price is null', () => {
    const nullEntry = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
      price_at_signal: null,
    })
    const nullExit = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-02T22:00:00+00:00',
      price_at_signal: null,
    })
    const unpricedOpen = signal({
      signal_type: 'short_entry',
      institution_id: BANK_B,
      created_at: '2026-06-03T22:00:00+00:00',
      price_at_signal: 100,
    })
    const out = deriveSignalStatus(
      [nullEntry, nullExit, unpricedOpen],
      prices({}),
    )
    expect(out.get(nullEntry.id)).toMatchObject({
      status: 'closed',
      markPrice: null,
      returnPct: null,
    })
    expect(out.get(unpricedOpen.id)).toMatchObject({
      status: 'open',
      markPrice: null,
      returnPct: null,
    })
  })

  it('treats watch signals as n/a and counts statuses', () => {
    const watch = signal({ signal_type: 'watch' })
    const entry = signal({
      signal_type: 'short_entry',
      created_at: '2026-06-01T22:00:00+00:00',
    })
    const exit = signal({
      signal_type: 'short_exit',
      created_at: '2026-06-02T22:00:00+00:00',
    })
    const out = deriveSignalStatus([watch, entry, exit], prices({}))
    expect(out.get(watch.id)?.status).toBe('n/a')
    expect(countByStatus(out)).toEqual({ open: 0, closed: 1, 'n/a': 2 })
    expect(out.size).toBe(3)
  })

  it('does not mutate its inputs', () => {
    const rows = [
      signal({
        signal_type: 'short_exit',
        created_at: '2026-06-09T22:00:00+00:00',
      }),
      signal({
        signal_type: 'short_exit',
        created_at: '2026-06-02T22:00:00+00:00',
      }),
      signal({
        signal_type: 'short_entry',
        created_at: '2026-06-01T22:00:00+00:00',
      }),
    ]
    const snapshot = rows.map((row) => ({ ...row }))
    deriveSignalStatus(rows, prices({}))
    expect(rows).toEqual(snapshot)
  })
})
