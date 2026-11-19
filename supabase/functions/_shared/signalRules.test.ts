import { describe, expect, it } from 'vitest'
import {
  dedupeSignals,
  fundingContribution,
  isFundingDriven,
} from './signalRules.ts'

const weights: Record<string, number> = {
  liquidity_warning: 0.17,
  client_withdrawal: 0.13,
  regulatory_signal: 0.06,
  news_sentiment: 0.04,
  stock_drop: 0.12,
}
const weightFor = (c: string) => weights[c] ?? 0.05

describe('isFundingDriven', () => {
  it('passes a jump driven by liquidity warnings and deposit outflows', () => {
    expect(
      isFundingDriven({
        prevRaw: 1,
        currentRaw: 30,
        prevComponents: { stock_drop: 8 },
        currentComponents: {
          stock_drop: 20,
          liquidity_warning: 100,
          client_withdrawal: 80,
        },
        weightFor,
      }),
    ).toBe(true)
  })

  it('rejects a compliance scandal like the Deutsche Bank leak', () => {
    expect(
      isFundingDriven({
        prevRaw: 0,
        currentRaw: 21.8,
        prevComponents: {},
        currentComponents: {
          regulatory_signal: 100,
          news_sentiment: 100,
          stock_drop: 75,
          client_withdrawal: 10,
        },
        weightFor,
      }),
    ).toBe(false)
  })

  it('rejects a flat or falling score and tolerates missing history', () => {
    const base = {
      prevComponents: null,
      currentComponents: { liquidity_warning: 100 },
      weightFor,
    }
    expect(isFundingDriven({ ...base, prevRaw: 17, currentRaw: 17 })).toBe(
      false,
    )
    expect(isFundingDriven({ ...base, prevRaw: 0, currentRaw: 17 })).toBe(true)
  })

  it('ignores non-numeric keys such as _raw and _weights', () => {
    expect(
      fundingContribution(
        { liquidity_warning: 50, _raw: 99, _weights: { a: 1 } },
        weightFor,
      ),
    ).toBeCloseTo(8.5, 10)
  })
})

describe('dedupeSignals', () => {
  const sig = (category: string, severity: string, signal_date: string) => ({
    category,
    severity,
    signal_date,
  })

  it('keeps one signal per category in a batch, the most severe', () => {
    const out = dedupeSignals(
      [
        sig('regulatory_signal', 'medium', '2026-11-18T10:00:00Z'),
        sig('regulatory_signal', 'high', '2026-11-18T10:00:00Z'),
        sig('stock_drop', 'low', '2026-11-18T10:00:00Z'),
      ],
      [],
    )
    expect(out.map((s) => `${s.category}/${s.severity}`)).toEqual([
      'regulatory_signal/high',
      'stock_drop/low',
    ])
  })

  it('drops a repeat of an existing signal within three days at the same or lower severity', () => {
    const existing = [sig('news_sentiment', 'medium', '2026-11-17T08:00:00Z')]
    expect(
      dedupeSignals(
        [sig('news_sentiment', 'medium', '2026-11-19T09:00:00Z')],
        existing,
      ),
    ).toEqual([])
    expect(
      dedupeSignals(
        [sig('news_sentiment', 'low', '2026-11-18T09:00:00Z')],
        existing,
      ),
    ).toEqual([])
  })

  it('records an escalation and anything outside the window', () => {
    const existing = [sig('news_sentiment', 'medium', '2026-11-17T08:00:00Z')]
    expect(
      dedupeSignals(
        [sig('news_sentiment', 'high', '2026-11-18T09:00:00Z')],
        existing,
      ),
    ).toHaveLength(1)
    expect(
      dedupeSignals(
        [sig('news_sentiment', 'medium', '2026-11-21T09:00:00Z')],
        existing,
      ),
    ).toHaveLength(1)
  })
})
