import { describe, expect, it } from 'vitest'
import {
  formatChange,
  formatScore,
  generateTradingSignals,
  shortExitLevel,
  type SignalInput,
} from './signals.ts'
import { SCORE_SPIKE, SHORT_ENTRY, SHORT_EXIT, WATCH } from './thresholds.ts'

function run(overrides: Partial<SignalInput>) {
  return generateTradingSignals({
    currentScore: 0,
    prevScore: 0,
    signalCount: 0,
    prevSignalCount: 0,
    openEntry: null,
    ...overrides,
  })
}

describe('formatting', () => {
  it('renders scores as an index with one decimal and no percent sign', () => {
    expect(formatScore(12)).toBe('12.0')
    expect(formatScore(6.449)).toBe('6.4')
    expect(formatChange(5)).toBe('+5.0')
    expect(formatChange(-2.51)).toBe('-2.5')
  })

  it('places the exit level at half the entry score, floored at SHORT_EXIT', () => {
    expect(shortExitLevel(8)).toBe(SHORT_EXIT)
    expect(shortExitLevel(10)).toBe(SHORT_EXIT)
    expect(shortExitLevel(20)).toBe(10)
    expect(shortExitLevel(33.5)).toBe(16.75)
  })
})

describe('short_entry', () => {
  it('fires on a cross-up over SHORT_ENTRY', () => {
    const out = run({ currentScore: 16.2, prevScore: 12.9 })
    expect([...out.keys()]).toEqual(['short_entry'])
    expect(out.get('short_entry')).toBe(
      `Risk score crossed ${SHORT_ENTRY} (now 16.2, was 12.9).`,
    )
  })

  it('fires on a spike while already above SHORT_ENTRY', () => {
    const out = run({ currentScore: 21.5, prevScore: 15.5 })
    expect([...out.keys()]).toEqual(['short_entry'])
    expect(out.get('short_entry')).toContain('jumped +6.0 in one day')
    expect(out.get('short_entry')).toContain('(15.5 to 21.5)')
  })

  it('emits one entry with a combined reason when it crosses and spikes', () => {
    const out = run({ currentScore: 21.5, prevScore: 12.9 })
    expect(out.size).toBe(1)
    const reason = out.get('short_entry') as string
    expect(reason).toContain(`crossed ${SHORT_ENTRY} (now 21.5, was 12.9)`)
    expect(reason).toContain('a one-day jump of +8.6')
  })

  it('does not fire on a spike that ends below SHORT_ENTRY', () => {
    const out = run({ currentScore: 14.9, prevScore: 9.0 })
    expect(out.has('short_entry')).toBe(false)
  })

  it('does not fire while hovering above the level without a move', () => {
    expect(run({ currentScore: 16.2, prevScore: 16.0 }).size).toBe(0)
    expect(run({ currentScore: 16.2, prevScore: 19.0 }).size).toBe(0)
  })

  it('suppresses watch and short_exit in the same run', () => {
    const out = run({
      currentScore: 17,
      prevScore: 7,
      openEntry: { score_at_signal: 40, signal_count_at_entry: 3 },
    })
    expect([...out.keys()]).toEqual(['short_entry'])
  })

  it('mentions new risk signals since the previous snapshot', () => {
    const one = run({
      currentScore: 16,
      prevScore: 12,
      signalCount: 4,
      prevSignalCount: 3,
    })
    expect(one.get('short_entry')).toMatch(
      / 1 new risk signal since the previous snapshot\.$/,
    )
    const several = run({
      currentScore: 16,
      prevScore: 12,
      signalCount: 6,
      prevSignalCount: 3,
    })
    expect(several.get('short_entry')).toMatch(
      / 3 new risk signals since the previous snapshot\.$/,
    )
    const fewer = run({
      currentScore: 16,
      prevScore: 12,
      signalCount: 2,
      prevSignalCount: 3,
    })
    expect(fewer.get('short_entry')).not.toContain('since the previous')
  })
})

describe('watch', () => {
  it('fires on a spike that crosses into the watch band', () => {
    const out = run({ currentScore: 12.0, prevScore: 6.5 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score jumped +5.5 in one day (6.5 to 12.0), crossing the watch level ${WATCH}.`,
    )
  })

  it('fires on a spike inside the watch band that was already above WATCH', () => {
    const out = run({ currentScore: 14.0, prevScore: 8.5 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score jumped +5.5 in one day (8.5 to 14.0), inside the watch band ${WATCH} to ${SHORT_ENTRY}.`,
    )
  })

  it('fires on a cross-up over WATCH without a spike', () => {
    const out = run({ currentScore: 8.4, prevScore: 7.1 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score rose to 8.4 from 7.1, crossing the watch level ${WATCH}.`,
    )
  })

  it('does not fire below WATCH, even on a spike', () => {
    expect(run({ currentScore: 7.9, prevScore: 1.0 }).size).toBe(0)
  })

  it('does not fire for a small move inside the band', () => {
    expect(run({ currentScore: 11.0, prevScore: 9.0 }).size).toBe(0)
  })

  it('needs a move of at least SCORE_SPIKE to count as a spike', () => {
    const base = 9
    expect(
      run({ currentScore: base + SCORE_SPIKE, prevScore: base }).has('watch'),
    ).toBe(true)
    expect(
      run({ currentScore: base + SCORE_SPIKE - 0.1, prevScore: base }).has(
        'watch',
      ),
    ).toBe(false)
  })
})

describe('short_exit', () => {
  const entry = { score_at_signal: 15.2, signal_count_at_entry: 5 }

  it('fires on a cross-down below SHORT_EXIT when an entry is open', () => {
    const out = run({
      currentScore: 4.7,
      prevScore: 5.2,
      signalCount: 5,
      prevSignalCount: 5,
      openEntry: { ...entry, days_open: 9 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
    expect(out.get('short_exit')).toBe(
      'Risk score fell to 4.7, below the exit level 7.6 (half the entry score of 15.2). No new risk signals in 9 days: the decline is time decay, not resolved risk.',
    )
  })

  it('stays silent on a cross-down without an open entry', () => {
    const out = run({ currentScore: 4.7, prevScore: 5.2, openEntry: null })
    expect(out.size).toBe(0)
  })

  it('stays silent on a one-day drop without an open entry', () => {
    const out = run({ currentScore: 6.0, prevScore: 12.0, openEntry: null })
    expect(out.size).toBe(0)
  })

  it('uses hysteresis against the entry score, not only SHORT_EXIT', () => {
    const high = { score_at_signal: 30, signal_count_at_entry: 2 }
    expect(
      run({ currentScore: 14.9, prevScore: 15.5, openEntry: high }).has(
        'short_exit',
      ),
    ).toBe(true)
    expect(
      run({ currentScore: 15.0, prevScore: 15.5, openEntry: high }).has(
        'short_exit',
      ),
    ).toBe(false)
  })

  it('floors the exit level at SHORT_EXIT for low entries', () => {
    const low = { score_at_signal: 8, signal_count_at_entry: 1 }
    const out = run({ currentScore: 4.9, prevScore: 6, openEntry: low })
    expect(out.get('short_exit')).toContain(
      `below the exit level ${SHORT_EXIT}.0 (entered at 8.0)`,
    )
    expect(
      run({ currentScore: 5.0, prevScore: 6, openEntry: low }).has(
        'short_exit',
      ),
    ).toBe(false)
  })

  it('words a decay-only exit with the days open and a day for one day', () => {
    const one = run({
      currentScore: 3,
      prevScore: 6,
      signalCount: 5,
      openEntry: { ...entry, days_open: 1 },
    })
    expect(one.get('short_exit')).toContain('No new risk signals in 1 day:')
    const today = run({
      currentScore: 3,
      prevScore: 6,
      signalCount: 5,
      openEntry: { ...entry, days_open: 0 },
    })
    expect(today.get('short_exit')).toContain(
      'No new risk signals since entry today:',
    )
    const unknown = run({
      currentScore: 3,
      prevScore: 6,
      signalCount: 4,
      openEntry: entry,
    })
    expect(unknown.get('short_exit')).toContain(
      'No new risk signals since entry:',
    )
  })

  it('words an evidence-driven exit by the signals added since entry', () => {
    const out = run({
      currentScore: 3,
      prevScore: 6,
      signalCount: 7,
      openEntry: { ...entry, days_open: 4 },
    })
    expect(out.get('short_exit')).toBe(
      'Risk score fell to 3.0, below the exit level 7.6 (half the entry score of 15.2). The 2 risk signals added since entry did not hold the score up.',
    )
    expect(out.get('short_exit')).not.toContain('time decay')
  })

  it('is state-based: fires against an open entry even without a previous snapshot', () => {
    const out = run({
      currentScore: 2,
      prevScore: null,
      prevSignalCount: null,
      signalCount: 5,
      openEntry: { ...entry, days_open: 12 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
  })

  it('suppresses watch in the same run', () => {
    const out = run({
      currentScore: 9,
      prevScore: 7,
      openEntry: { score_at_signal: 20, signal_count_at_entry: 1 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
  })
})

describe('first observation', () => {
  it('emits nothing when there is no previous snapshot and no open entry', () => {
    for (const score of [0, 7.9, 8, 14.9, 15, 33.5]) {
      const out = run({
        currentScore: score,
        prevScore: null,
        prevSignalCount: null,
        signalCount: 3,
      })
      expect(out.size).toBe(0)
    }
  })
})

describe('invariants', () => {
  it('never emits more than one signal per type and never a percent sign', () => {
    const cases: Array<Partial<SignalInput>> = [
      {
        currentScore: 21.5,
        prevScore: 12.9,
        signalCount: 9,
        prevSignalCount: 2,
      },
      { currentScore: 12.0, prevScore: 6.5 },
      {
        currentScore: 4.7,
        prevScore: 5.2,
        openEntry: {
          score_at_signal: 15.2,
          signal_count_at_entry: 5,
          days_open: 3,
        },
      },
      {
        currentScore: 2,
        prevScore: 6,
        signalCount: 8,
        openEntry: { score_at_signal: 15.2, signal_count_at_entry: 5 },
      },
    ]
    for (const c of cases) {
      const out = run(c)
      expect(out.size).toBeGreaterThan(0)
      for (const reason of out.values()) {
        expect(reason).not.toContain('%')
        expect(reason).not.toContain('!')
      }
    }
  })
})
