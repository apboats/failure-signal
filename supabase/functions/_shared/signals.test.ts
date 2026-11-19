import { describe, expect, it } from 'vitest'
import {
  formatChange,
  formatScore,
  generateTradingSignals,
  shortExitLevel,
  type SignalInput,
} from './signals.ts'
import { SCORE_SPIKE, SHORT_ENTRY, SHORT_EXIT, WATCH } from './thresholds.ts'

// Scores below are on the display scale (shared/thresholds.ts):
// SHORT_EXIT 25, WATCH 40, SHORT_ENTRY 60, SCORE_SPIKE 15.

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
    expect(shortExitLevel(32)).toBe(SHORT_EXIT)
    expect(shortExitLevel(50)).toBe(SHORT_EXIT)
    expect(shortExitLevel(80)).toBe(40)
    expect(shortExitLevel(90)).toBe(45)
  })
})

describe('short_entry', () => {
  it('fires on a cross-up over SHORT_ENTRY', () => {
    const out = run({ currentScore: 64.8, prevScore: 51.6 })
    expect([...out.keys()]).toEqual(['short_entry'])
    expect(out.get('short_entry')).toBe(
      `Risk score crossed ${SHORT_ENTRY} (now 64.8, was 51.6).`,
    )
  })

  it('fires on a spike while already above SHORT_ENTRY', () => {
    const out = run({ currentScore: 86.0, prevScore: 62.0 })
    expect([...out.keys()]).toEqual(['short_entry'])
    expect(out.get('short_entry')).toContain('jumped +24.0 in one day')
    expect(out.get('short_entry')).toContain('(62.0 to 86.0)')
  })

  it('emits one entry with a combined reason when it crosses and spikes', () => {
    const out = run({ currentScore: 86.0, prevScore: 51.6 })
    expect(out.size).toBe(1)
    const reason = out.get('short_entry') as string
    expect(reason).toContain(`crossed ${SHORT_ENTRY} (now 86.0, was 51.6)`)
    expect(reason).toContain('a one-day jump of +34.4')
  })

  it('does not fire on a spike that ends below SHORT_ENTRY', () => {
    const out = run({ currentScore: 59.6, prevScore: 36.0 })
    expect(out.has('short_entry')).toBe(false)
  })

  it('does not fire while hovering above the level without a move', () => {
    expect(run({ currentScore: 64.8, prevScore: 64.0 }).size).toBe(0)
    expect(run({ currentScore: 64.8, prevScore: 76.0 }).size).toBe(0)
  })

  it('suppresses watch and short_exit in the same run', () => {
    const out = run({
      currentScore: 68,
      prevScore: 28,
      openEntry: { score_at_signal: 90, signal_count_at_entry: 3 },
    })
    expect([...out.keys()]).toEqual(['short_entry'])
  })

  it('mentions new risk signals since the previous snapshot', () => {
    const one = run({
      currentScore: 64,
      prevScore: 48,
      signalCount: 4,
      prevSignalCount: 3,
    })
    expect(one.get('short_entry')).toMatch(
      / 1 new risk signal since the previous snapshot\.$/,
    )
    const several = run({
      currentScore: 64,
      prevScore: 48,
      signalCount: 6,
      prevSignalCount: 3,
    })
    expect(several.get('short_entry')).toMatch(
      / 3 new risk signals since the previous snapshot\.$/,
    )
    const fewer = run({
      currentScore: 64,
      prevScore: 48,
      signalCount: 2,
      prevSignalCount: 3,
    })
    expect(fewer.get('short_entry')).not.toContain('since the previous')
  })
})

describe('watch', () => {
  it('fires on a spike that crosses into the watch band', () => {
    const out = run({ currentScore: 48.0, prevScore: 26.0 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score jumped +22.0 in one day (26.0 to 48.0), crossing the watch level ${WATCH}.`,
    )
  })

  it('fires on a spike inside the watch band that was already above WATCH', () => {
    const out = run({ currentScore: 59.0, prevScore: 42.0 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score jumped +17.0 in one day (42.0 to 59.0), inside the watch band ${WATCH} to ${SHORT_ENTRY}.`,
    )
  })

  it('fires on a cross-up over WATCH without a spike', () => {
    const out = run({ currentScore: 41.6, prevScore: 36.4 })
    expect([...out.keys()]).toEqual(['watch'])
    expect(out.get('watch')).toBe(
      `Risk score rose to 41.6 from 36.4, crossing the watch level ${WATCH}.`,
    )
  })

  it('does not fire below WATCH, even on a spike', () => {
    expect(run({ currentScore: 39.6, prevScore: 4.0 }).size).toBe(0)
  })

  it('does not fire for a small move inside the band', () => {
    expect(run({ currentScore: 44.0, prevScore: 42.0 }).size).toBe(0)
  })

  it('needs a move of at least SCORE_SPIKE to count as a spike', () => {
    const base = 42
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
  const entry = { score_at_signal: 60.8, signal_count_at_entry: 5 }

  it('fires on a cross-down below the exit level when an entry is open', () => {
    const out = run({
      currentScore: 28.0,
      prevScore: 31.0,
      signalCount: 5,
      prevSignalCount: 5,
      openEntry: { ...entry, days_open: 9 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
    expect(out.get('short_exit')).toBe(
      'Risk score fell to 28.0, below the exit level 30.4 (half the entry score of 60.8). No new risk signals in 9 days: the decline is time decay, not resolved risk.',
    )
  })

  it('stays silent on a cross-down without an open entry', () => {
    const out = run({ currentScore: 28.0, prevScore: 31.0, openEntry: null })
    expect(out.size).toBe(0)
  })

  it('stays silent on a one-day drop without an open entry', () => {
    const out = run({ currentScore: 24.0, prevScore: 48.0, openEntry: null })
    expect(out.size).toBe(0)
  })

  it('uses hysteresis against the entry score, not only SHORT_EXIT', () => {
    const high = { score_at_signal: 90, signal_count_at_entry: 2 }
    expect(
      run({ currentScore: 44.9, prevScore: 46.0, openEntry: high }).has(
        'short_exit',
      ),
    ).toBe(true)
    expect(
      run({ currentScore: 45.0, prevScore: 46.0, openEntry: high }).has(
        'short_exit',
      ),
    ).toBe(false)
  })

  it('floors the exit level at SHORT_EXIT for low entries', () => {
    const low = { score_at_signal: 32, signal_count_at_entry: 1 }
    const out = run({ currentScore: 24.9, prevScore: 26, openEntry: low })
    expect(out.get('short_exit')).toContain(
      `below the exit level ${SHORT_EXIT}.0 (entered at 32.0)`,
    )
    expect(
      run({ currentScore: 25.0, prevScore: 26, openEntry: low }).has(
        'short_exit',
      ),
    ).toBe(false)
  })

  it('words a decay-only exit with the days open and a day for one day', () => {
    const one = run({
      currentScore: 12,
      prevScore: 24,
      signalCount: 5,
      openEntry: { ...entry, days_open: 1 },
    })
    expect(one.get('short_exit')).toContain('No new risk signals in 1 day:')
    const today = run({
      currentScore: 12,
      prevScore: 24,
      signalCount: 5,
      openEntry: { ...entry, days_open: 0 },
    })
    expect(today.get('short_exit')).toContain(
      'No new risk signals since entry today:',
    )
    const unknown = run({
      currentScore: 12,
      prevScore: 24,
      signalCount: 4,
      openEntry: entry,
    })
    expect(unknown.get('short_exit')).toContain(
      'No new risk signals since entry:',
    )
  })

  it('words an evidence-driven exit by the signals added since entry', () => {
    const out = run({
      currentScore: 12,
      prevScore: 24,
      signalCount: 7,
      openEntry: { ...entry, days_open: 4 },
    })
    expect(out.get('short_exit')).toBe(
      'Risk score fell to 12.0, below the exit level 30.4 (half the entry score of 60.8). The 2 risk signals added since entry did not hold the score up.',
    )
    expect(out.get('short_exit')).not.toContain('time decay')
  })

  it('is state-based: fires against an open entry even without a previous snapshot', () => {
    const out = run({
      currentScore: 8,
      prevScore: null,
      prevSignalCount: null,
      signalCount: 5,
      openEntry: { ...entry, days_open: 12 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
  })

  it('suppresses watch in the same run', () => {
    const out = run({
      currentScore: 44,
      prevScore: 36,
      openEntry: { score_at_signal: 90, signal_count_at_entry: 1 },
    })
    expect([...out.keys()]).toEqual(['short_exit'])
  })
})

describe('first observation', () => {
  it('emits nothing when there is no previous snapshot and no open entry', () => {
    for (const score of [0, 39.9, 40, 59.9, 60, 87.7]) {
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
        currentScore: 86.0,
        prevScore: 51.6,
        signalCount: 9,
        prevSignalCount: 2,
      },
      { currentScore: 48.0, prevScore: 26.0 },
      {
        currentScore: 28.0,
        prevScore: 31.0,
        openEntry: {
          score_at_signal: 60.8,
          signal_count_at_entry: 5,
          days_open: 3,
        },
      },
      {
        currentScore: 8,
        prevScore: 24,
        signalCount: 8,
        openEntry: { score_at_signal: 60.8, signal_count_at_entry: 5 },
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
