import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WATCH } from '@shared/thresholds'
import { buildBenchmarkIndex } from '@/domain/analytics/benchmark'
import {
  aggregateStats,
  detectEvents,
  verdict,
  type HorizonStats,
} from '@/domain/analytics/eventStudy'
import {
  fixtureBenchmarks,
  fixtureIndex,
  fixtureRows,
} from '@/domain/analytics/fixtures'
import { computeLeadLag } from '@/domain/analytics/leadLag'
import {
  computeDataWindow,
  toTradingDaySeries,
} from '@/domain/analytics/series'
import { DataWindowBar } from './DataWindowBar'
import { EventControls } from './EventControls'
import { EventsTable, type EventRow } from './EventsTable'
import { DEFAULT_EVENT_CONTROLS } from './controls'
import { LeadLagTable, type LeadLagTableRow } from './LeadLagTable'
import { describeDataWindow, sinceForRange } from './range'
import { StatsTable } from './StatsTable'
import { VerdictCard } from './VerdictCard'

/*
 * Markup assertions in the node environment (jsdom needs Node >= 22.15; see
 * src/components/ui/DataTable.test.tsx). Charts are not rendered here.
 */

const series = toTradingDaySeries(fixtureRows()).series
const xlf = buildBenchmarkIndex(fixtureBenchmarks()).lookup('XLF')
const study = detectEvents(series, { kind: 'level', threshold: WATCH }, xlf)
const stats = aggregateStats(study.events, study.baseline, study.horizons)

const BANNED = [/accumulat/i, /check back/i, /~\s?50%/, /random would/i]

function expectHonestCopy(html: string) {
  for (const pattern of BANNED) expect(html).not.toMatch(pattern)
}

describe('range helpers', () => {
  it('turns a range into a since date and leaves "all" unbounded', () => {
    const now = new Date(2026, 10, 18) // Nov 18, 2026 local
    expect(sinceForRange('90d', now)).toBe('2026-08-20')
    expect(sinceForRange('180d', now)).toBe('2026-05-22')
    expect(sinceForRange('1y', now)).toBe('2025-11-18')
    expect(sinceForRange('all', now)).toBeUndefined()
  })

  it('describes the window from the rows that came back', () => {
    const window = computeDataWindow(fixtureRows(), fixtureIndex())
    expect(describeDataWindow(window)).toBe(
      '80 snapshots · Jun 1 – Jun 16, 2026 · 5 banks (1 inactive excluded)',
    )
    expect(describeDataWindow(computeDataWindow([], fixtureIndex()))).toBe(
      'No priced snapshots in this range',
    )
  })
})

describe('DataWindowBar', () => {
  it('labels the range Select and prints the window line', () => {
    const html = renderToStaticMarkup(
      <DataWindowBar
        range="180d"
        onRangeChange={() => {}}
        dataWindow={computeDataWindow(fixtureRows(), fixtureIndex())}
      />,
    )
    expect(html).toMatch(/<label for="validation-range"/)
    expect(html).toMatch(/<select[^>]*id="validation-range"[^>]*>/)
    expect(html).toContain('80 snapshots · Jun 1 – Jun 16, 2026 · 5 banks')
    expectHonestCopy(html)
  })

  it('shows a skeleton while loading', () => {
    const html = renderToStaticMarkup(
      <DataWindowBar range="90d" onRangeChange={() => {}} dataWindow={null} />,
    )
    expect(html).toContain('animate-pulse')
  })
})

describe('VerdictCard', () => {
  it('says insufficient with n, the horizon and the measured baseline', () => {
    const html = renderToStaticMarkup(
      <VerdictCard verdict={verdict(stats)} benchmarkTicker="XLF" />,
    )
    expect(html).toContain('Insufficient: n=2 at 5d (need 30)')
    expect(html).toContain('2 of 4')
    expect(html).toMatch(
      /non-event days in the same window underperformed XLF \d+% of the time \(n = \d+\)/,
    )
    expect(html).toContain('± 1.96·SE')
    expectHonestCopy(html)
  })

  it('renders a pos badge for a predictive verdict and a neg badge for no edge', () => {
    const base: HorizonStats = {
      ...stats[1],
      n: 40,
      total: 40,
      t: -2.5,
      avgExcess: -1.5,
      se: 0.5,
      hitRate: 70,
      hitCI: { lower: 55, upper: 82 },
      baseHitRate: 50,
    }
    const predictive = renderToStaticMarkup(
      <VerdictCard verdict={verdict([base])} benchmarkTicker="SPY" />,
    )
    expect(predictive).toMatch(/text-pos[^>]*>Predictive at 5d</)
    expect(predictive).toContain('-1.50%')
    expect(predictive).toContain('± 0.98%')
    expect(predictive).toContain('lower bound above the baseline')
    const noEdge = renderToStaticMarkup(
      <VerdictCard
        verdict={verdict([{ ...base, t: -0.4 }])}
        benchmarkTicker="SPY"
      />,
    )
    expect(noEdge).toMatch(/text-neg[^>]*>No edge at 5d</)
    expectHonestCopy(predictive)
    expectHonestCopy(noEdge)
  })
})

describe('StatsTable', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <StatsTable stats={stats} benchmarkTicker="XLF" />
    </MemoryRouter>,
  )

  it('has Best and Worst columns and greys rows with fewer than ten events', () => {
    expect(html).toContain('Best (short)')
    expect(html).toContain('Worst (short)')
    expect((html.match(/>insufficient</g) ?? []).length).toBe(4)
  })

  it('shows the hit rate with its Wilson interval and the baseline column', () => {
    expect(html).toMatch(/100% <span class="text-muted">\(4\/4, CI 51–100%\)/)
    expect(html).toContain('Baseline hit')
  })

  it('colours the most negative excess pos only when the row has enough events', () => {
    const enough = stats.map((row) => ({ ...row, insufficient: false }))
    const coloured = renderToStaticMarkup(
      <MemoryRouter>
        <StatsTable stats={enough} benchmarkTicker="XLF" />
      </MemoryRouter>,
    )
    expect(coloured).toMatch(/text-pos[^>]*>-\d+\.\d\d%/)
    expect(html).not.toMatch(/text-pos[^>]*>-\d+\.\d\d%/)
  })
})

describe('EventsTable', () => {
  const rows: EventRow[] = study.events.map((event) => ({
    ...event,
    key: `${event.institutionId}:${event.date}`,
    name: `Bank ${event.institutionId.slice(-1).toUpperCase()}`,
    ticker: event.institutionId.slice(-1).toUpperCase(),
  }))
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <EventsTable
        rows={rows}
        distinctDates={study.distinctDates}
        distinctBanks={study.distinctBanks}
        horizons={study.horizons}
        verdictHorizon={5}
      />
    </MemoryRouter>,
  )

  it('counts events, distinct dates and banks in the header', () => {
    expect(html).toContain('4 events · 3 dates · 4 banks')
  })

  it('puts the hit column on the primary cell and links each bank', () => {
    expect(html).toContain('Hit (5d)')
    expect(html).toMatch(/max-md:col-span-2[^>]*><span[^>]*>Hit</)
    expect(html).toMatch(/href="\/institution\/bank-a"/)
    expect(html).toContain('>No return<')
  })

  it('renders scores through ScoreValue and excess through Delta', () => {
    expect(html).toMatch(/text-risk-3[^>]*>45\.0/)
    expect(html).toMatch(/text-pos[^>]*>-1\.50%/)
  })
})

describe('EventControls', () => {
  it('labels every slider by id, bounds it at 1..SEVERE and names horizons in trading days', () => {
    const html = renderToStaticMarkup(
      <EventControls
        value={DEFAULT_EVENT_CONTROLS}
        onChange={() => {}}
        horizons={[1, 5, 10, 20]}
      />,
    )
    expect(html).toMatch(/<label for="event-level-threshold"/)
    expect(html).toMatch(
      /<input type="range" min="1" max="80" step="1"[^>]*id="event-level-threshold"/,
    )
    expect(html).toContain('1, 5, 10 and 20 trading days')
    expect(html).not.toContain('Caution')
    const velocity = renderToStaticMarkup(
      <EventControls
        value={{ ...DEFAULT_EVENT_CONTROLS, kind: 'velocity' }}
        onChange={() => {}}
        horizons={[1, 5, 10, 20]}
      />,
    )
    expect(velocity).toMatch(/<label for="event-velocity-delta"/)
    expect(velocity).toMatch(/<label for="event-velocity-window"/)
    expect(velocity).toContain('Caution: velocity events cluster')
    expectHonestCopy(html)
    expectHonestCopy(velocity)
  })
})

describe('LeadLagTable', () => {
  const rows: LeadLagTableRow[] = computeLeadLag(series, 1, 5).map((row) => ({
    ...row,
    name: `Bank ${row.institutionId.slice(-1).toUpperCase()}`,
    ticker: row.institutionId.slice(-1).toUpperCase(),
  }))

  it('shows the CI text, greys banks with fewer than ten high days and selects with aria-pressed', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LeadLagTable
          rows={rows}
          lagDays={1}
          selectedId="bank-a"
          onSelect={() => {}}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('High score → drop')
    expect(html).toMatch(/100% <span class="text-muted">\(4\/4\)/)
    expect(html).toContain('CI 51–100%')
    expect(html).toContain('under 10 high days')
    expect(html).toMatch(
      /<button type="button" aria-pressed="true"[^>]*>.*?>A</,
    )
    expect(html).toMatch(/<button type="button" aria-pressed="false"/)
    // The key column's own <th> carries no breakpoint class, so it is never hidden.
    const dropHeader =
      html.match(/<th[^>]*>(?:(?!<\/th>)[\s\S])*?High score → drop/)?.[0] ?? ''
    expect(dropHeader).not.toBe('')
    expect(dropHeader).not.toMatch(/max-(sm|md|lg):hidden/)
    expectHonestCopy(html)
  })
})
