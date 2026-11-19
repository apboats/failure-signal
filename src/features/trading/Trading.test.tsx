import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/queries/keys'
import type { LatestScores } from '@/api/scores'
import type {
  Institution,
  LatestPrice,
  Position,
  TradingSignal,
} from '@shared/types'
import { Trading } from '@/pages/Trading'
import {
  openPositionSearch,
  readPositionPrefill,
  withoutPrefill,
} from './prefill'

/*
 * Markup assertions in the node environment (jsdom 31 does not load on this
 * Node, see DataTable.test.tsx). The React Query cache is seeded so every
 * hook resolves synchronously and the page renders its content branch.
 */

const ACTIVE: Institution = {
  id: 'inst-active',
  name: 'Active Bancorp',
  ticker: 'ACTV',
  sector: 'regional_bank',
  is_active: true,
  created_at: '2026-01-01T00:00:00+00:00',
} as Institution

const INACTIVE: Institution = {
  ...ACTIVE,
  id: 'inst-inactive',
  name: 'Retired Trust',
  ticker: 'RTRD',
  is_active: false,
}

const signal = (
  overrides: Partial<TradingSignal> & Pick<TradingSignal, 'id' | 'signal_type'>,
): TradingSignal => ({
  institution_id: ACTIVE.id,
  score_at_signal: 16.2,
  score_change: 3.1,
  price_at_signal: 100,
  reason: 'Score crossed 15',
  is_active: true,
  created_at: '2026-06-01T22:00:10.132667+00:00',
  ...overrides,
})

const SIGNALS: TradingSignal[] = [
  // Open short entry, latest price 80 -> +20.00%
  signal({ id: 'open-entry', signal_type: 'short_entry' }),
  // Closed by a later exit at 70 -> +30.00%
  signal({
    id: 'closed-entry',
    signal_type: 'short_entry',
    created_at: '2026-05-01T22:00:00+00:00',
  }),
  signal({
    id: 'exit',
    signal_type: 'short_exit',
    price_at_signal: 70,
    created_at: '2026-05-10T22:00:00+00:00',
  }),
  // Null price at signal -> n/a
  signal({
    id: 'null-price-entry',
    signal_type: 'short_entry',
    price_at_signal: null,
    created_at: '2026-06-02T22:00:00+00:00',
  }),
  // Inactive bank: hidden by default, named (never "Unknown") when shown
  signal({
    id: 'inactive-watch',
    signal_type: 'watch',
    institution_id: INACTIVE.id,
    score_at_signal: 9.4,
  }),
]

const PRICES = new Map<string, LatestPrice>([
  [ACTIVE.id, { price: 80, change_pct: -1.5, date: '2026-11-17' }],
])

const EMPTY_SCORES: LatestScores = {
  scores: new Map(),
  lastComputedAt: null,
  source: 'view',
}

function seededClient(positions: Position[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(queryKeys.institutions, [ACTIVE, INACTIVE])
  client.setQueryData(queryKeys.tradingSignals, SIGNALS)
  client.setQueryData(queryKeys.positions, positions)
  client.setQueryData(queryKeys.latestScores, EMPTY_SCORES)
  client.setQueryData(queryKeys.latestPrices([ACTIVE.id, INACTIVE.id]), PRICES)
  client.setQueryData(queryKeys.latestPrices([ACTIVE.id]), PRICES)
  client.setQueryData(queryKeys.latestPrices([]), new Map())
  return client
}

const render = (ui: ReactElement, url: string, positions: Position[] = []) =>
  renderToStaticMarkup(
    <QueryClientProvider client={seededClient(positions)}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

const position = (overrides: Partial<Position>): Position => ({
  id: 'pos-1',
  institution_id: ACTIVE.id,
  direction: 'short',
  entry_price: 50,
  entry_date: '2026-11-01',
  entry_score: 16,
  exit_price: null,
  exit_date: null,
  exit_score: null,
  shares: 100,
  notes: null,
  is_open: true,
  created_at: '2026-11-01T15:00:00+00:00',
  ...overrides,
})

describe('Trading page: Signals tab', () => {
  it('sets the title, selects the Signals tab and lists every signal of an active bank with derived status and return', () => {
    const out = render(<Trading />, '/trading')
    expect(out).toContain('<title>Trading · Failure Signal</title>')
    expect(out).toMatch(/id="tab-signals" aria-selected="true"/)
    // Open entry: +20.00% vs latest price 80, with the Open position action seeded for a short at 80
    expect(out).toContain('+20.00%')
    expect(out).toContain('>Open<')
    expect(out).toContain(
      'href="/trading?tab=positions&amp;institution_id=inst-active&amp;direction=short&amp;price=80"',
    )
    // Closed entry: +30.00% vs the exit price 70
    expect(out).toContain('+30.00%')
    expect(out).toContain('>Closed<')
    // Null price at signal -> n/a, never 0.00%
    expect(out).toContain('>n/a<')
    expect(out).not.toMatch(/>[+-]?0\.00%</)
    // Scores are an index, never a percentage
    expect(out).toContain('>16.2<')
    expect(out).not.toContain('16.2%')
    // Inactive bank hidden by default; the count says so
    expect(out).not.toContain('Retired Trust')
    expect(out).toContain('4 of 5')
    expect(out).toContain('Show inactive (1)')
    expect(out).not.toContain('Unknown')
  })

  it('never paints a signal type or direction red/green', () => {
    const out = render(<Trading />, '/trading')
    expect(out).toMatch(/text-accent[^>]*>Short entry</)
    expect(out).toMatch(/text-muted[^>]*>Short exit</)
    expect(out).not.toMatch(/text-(pos|neg)[^>]*>Short entry</)
    expect(out).not.toMatch(/text-(pos|neg)[^>]*>Short exit</)
  })

  it('shows the honest empty state when no signal matches', () => {
    const client = seededClient([])
    client.setQueryData(queryKeys.tradingSignals, [])
    const out = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/trading']}>
          <Trading />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(out).toContain('No trading signals yet')
    expect(out).not.toContain('accumulating')
  })
})

describe('Trading page: Positions tab', () => {
  it('renders dash tiles and honest empty states when there are no positions', () => {
    const out = render(<Trading />, '/trading?tab=positions')
    expect(out).toMatch(/id="tab-positions" aria-selected="true"/)
    const dashes = out.match(/text-2xl font-semibold tabular-nums[^>]*>—</g)
    expect(dashes).toHaveLength(4)
    expect(out).not.toContain('+$0.00')
    expect(out).not.toContain('>0%<')
    expect(out).toContain('No open positions.')
    expect(out).toContain('Open one from a trading signal.')
    expect(out).toContain('No closed positions.')
    expect(out).toContain('>New position<')
  })

  it('marks open positions to the latest price and summarises closed ones, with Short/Long neutral', () => {
    const out = render(<Trading />, '/trading?tab=positions', [
      position({ id: 'open-short' }),
      position({
        id: 'closed-zero',
        is_open: false,
        exit_price: 0,
        exit_date: '2026-11-10',
        created_at: '2026-10-01T15:00:00+00:00',
      }),
      position({
        id: 'closed-breakeven',
        direction: 'long',
        is_open: false,
        exit_price: 50,
        exit_date: '2026-11-12',
        created_at: '2026-10-02T15:00:00+00:00',
      }),
    ])
    // Realised: +5000 (short closed at $0) + 0 (breakeven) = +$5,000.00; win rate 1 of 2 = 50%
    expect(out).toContain('+$5,000.00')
    expect(out).toContain('>50%<')
    expect(out).toContain('1 of 2 closed')
    // Unrealised: short 100 @ 50 marked at 80 = -$3,000.00 (-60.00%) as of Nov 17, 2026
    expect(out).toContain('-$3,000.00')
    expect(out).toContain('-60.00%')
    expect(out).toContain('as of Nov 17, 2026')
    // Total: +5000 - 3000 = +$2,000.00
    expect(out).toContain('+$2,000.00')
    // Breakeven row is muted, not green
    expect(out).toMatch(/text-muted[^>]*>\$0\.00</)
    // Direction chips are neutral: the Badge class precedes the icon span and its svg
    const chip = (tone: string, label: string) =>
      new RegExp(
        `${tone}"><span aria-hidden="true"[^>]*><svg[\\s\\S]*?</svg></span>${label}</span>`,
      )
    expect(out).toMatch(chip('bg-muted/15 text-muted', 'Short'))
    expect(out).toMatch(chip('bg-muted/15 text-muted', 'Long'))
    expect(out).not.toMatch(chip('text-(?:pos|neg)', '(?:Short|Long)'))
    expect(out).toContain('>Close<')
  })

  it('opens the form prefilled from the URL and keeps the inactive bank selectable', () => {
    const out = render(
      <Trading />,
      `/trading${openPositionSearch(INACTIVE.id, 'short', 12.5)}`,
    )
    expect(out).toContain('>New position<')
    expect(out).toMatch(/<h2[^>]*><span class="truncate">New position<\/span>/)
    expect(out).toContain('<option value="inst-inactive" selected="">')
    expect(out).toContain('Retired Trust (RTRD) · inactive')
    expect(out).toMatch(/value="12.5"/)
    expect(out).toContain('Seeded from the signal: $12.50')
    expect(out).toMatch(/type="date"[^>]*value="\d{4}-\d{2}-\d{2}"/)
    // Every control has a label
    for (const label of [
      'Bank',
      'Entry price',
      'Shares',
      'Trade date',
      'Notes',
    ])
      expect(out).toMatch(
        new RegExp(`<label for="[^"]+"[^>]*>${label}</label>`),
      )
  })
})

describe('prefill helpers', () => {
  it('reads only valid values and strips them without touching ?tab=', () => {
    const params = new URLSearchParams(
      'tab=positions&institution_id=x&direction=long&price=12.5',
    )
    expect(readPositionPrefill(params)).toEqual({
      institutionId: 'x',
      direction: 'long',
      price: 12.5,
    })
    expect(
      readPositionPrefill(
        new URLSearchParams('institution_id=x&direction=sideways&price=-1'),
      ),
    ).toEqual({ institutionId: 'x' })
    expect(withoutPrefill(params).toString()).toBe('tab=positions')
    expect(openPositionSearch('x', 'short', null)).toBe(
      '?tab=positions&institution_id=x&direction=short',
    )
  })
})
