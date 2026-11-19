import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { QueryError } from '@/lib/fetchAll'
import { queryKeys } from '@/queries/keys'
import { SEVERE } from '@shared/thresholds'
import type { AlertConfig, AlertHistory, Institution } from '@shared/types'
import { AlertForm, AlertFormView, type AlertFormValues } from './AlertForm'
import { AlertHistoryList } from './AlertHistoryList'
import { AlertList } from './AlertList'
import { Alerts } from '@/pages/Alerts'

/*
 * Markup assertions in the node environment (jsdom needs Node >= 22.15 here).
 * Query data is seeded into the cache, so useQuery resolves synchronously in
 * renderToStaticMarkup; mutations are idle.
 */

const institution = (
  id: string,
  name: string,
  ticker: string | null,
  is_active = true,
): Institution => ({
  id,
  name,
  ticker,
  sector: 'Regional bank',
  description: null,
  logo_url: null,
  is_active,
  cik: null,
  created_at: '2026-04-13T00:00:00Z',
  updated_at: '2026-04-13T00:00:00Z',
})

const institutions: Institution[] = [
  institution('a', 'Alpha Bancorp', 'ALFA'),
  institution('b', 'Beta Financial', 'BETA'),
  institution('z', 'Zeta Trust', 'ZETA', false),
]

const configs: AlertConfig[] = [
  {
    id: 'c1',
    institution_id: 'a',
    user_id: null,
    threshold_score: 8,
    signal_categories: ['stock_drop', 'liquidity_warning'],
    notify_email: false,
    notify_in_app: true,
    is_active: true,
    created_at: '2026-11-17T10:00:00Z',
  },
  {
    id: 'c2',
    institution_id: 'z',
    user_id: null,
    threshold_score: 15,
    signal_categories: null,
    notify_email: false,
    notify_in_app: true,
    is_active: false,
    created_at: '2026-11-16T10:00:00Z',
  },
]

const history: AlertHistory[] = [
  {
    id: 'h1',
    alert_config_id: 'c1',
    institution_id: 'a',
    triggered_score: 9.2,
    trigger_reason: 'Score 9.2 crossed threshold 8',
    acknowledged_at: null,
    created_at: '2026-11-17T12:15:00Z',
  },
]

function render(
  ui: ReactElement,
  seed: {
    institutions?: Institution[]
    alerts?: AlertConfig[]
    history?: AlertHistory[]
  } = {},
  url = '/alerts',
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  if (seed.institutions)
    client.setQueryData(queryKeys.institutions, seed.institutions)
  if (seed.alerts) client.setQueryData(queryKeys.alerts, seed.alerts)
  if (seed.history)
    client.setQueryData(queryKeys.alertHistory(50), seed.history)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const baseValues: AlertFormValues = {
  institutionId: '',
  threshold: 40,
  categories: [],
}

const viewProps = {
  values: baseValues,
  onChange: () => {},
  institutions,
  institutionsPending: false,
  institutionsError: null,
  saving: false,
  error: null,
  onSubmit: () => {},
  onClose: () => {},
}

describe('AlertFormView', () => {
  it('labels every control and bounds the slider at 1..SEVERE', () => {
    const html = render(<AlertFormView {...viewProps} />)
    expect(html).toContain('for="alert-institution"')
    expect(html).toContain('id="alert-institution"')
    expect(html).toContain('for="threshold"')
    const range = html.match(/<input type="range"[^>]*>/)?.[0] ?? ''
    expect(range).toContain('id="threshold"')
    expect(range).toContain('min="1"')
    expect(range).toContain(`max="${SEVERE}"`)
    expect(range).toContain('step="1"')
    // The threshold reads as an index, never a percentage.
    expect(html).toContain('40.0')
    expect(html).not.toContain('%')
    expect(html).toContain('Elevated')
  })

  it('is in-app only and keeps the submit disabled until a bank is chosen', () => {
    const html = render(<AlertFormView {...viewProps} />)
    expect(html).not.toMatch(/email/i)
    expect(html).toContain(
      'Logs an event here and on the Watchlist when the score crosses the threshold.',
    )
    expect(html).toMatch(/<button type="submit"[^>]*\sdisabled=""/)
    expect(html).toContain('aria-label="Close form"')
  })

  it('renders categories as aria-pressed toggles, filled when selected', () => {
    const html = render(
      <AlertFormView
        {...viewProps}
        values={{
          ...baseValues,
          institutionId: 'a',
          categories: ['cds_spike'],
        }}
      />,
    )
    expect(html).toMatch(
      /aria-pressed="true"[^>]*bg-accent text-white[^>]*>.*CDS spike/,
    )
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Stock drop/)
    expect(html).toContain('1 of 13 categories')
    expect(html).not.toMatch(/<button type="submit"[^>]*\sdisabled=""/)
  })

  it('shows the write error verbatim with the values still in place', () => {
    const error = new QueryError(
      {
        message:
          'new row violates row-level security policy for table "alert_configs"',
        code: '42501',
        hint: null,
        details: null,
      },
      401,
    )
    const html = render(
      <AlertFormView
        {...viewProps}
        values={{ ...baseValues, institutionId: 'b', threshold: 48 }}
        error={error}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(
      'new row violates row-level security policy for table &quot;alert_configs&quot;',
    )
    expect(html).toMatch(/<option[^>]*value="b"[^>]*selected/)
    expect(html).toMatch(/<input type="range"[^>]*value="48"/)
  })

  it('offers no inactive banks except a prefilled one', () => {
    const plain = render(<AlertForm onClose={() => {}} />, { institutions })
    expect(plain).toContain('Alpha Bancorp (ALFA)')
    expect(plain).not.toContain('Zeta Trust')
    const prefilled = render(
      <AlertForm initialInstitutionId="z" onClose={() => {}} />,
      { institutions },
    )
    expect(prefilled).toContain('Zeta Trust (ZETA) · inactive')
    expect(prefilled).toMatch(/<option[^>]*value="z"[^>]*selected/)
  })
})

describe('AlertList', () => {
  it('resolves inactive banks and names every icon button', () => {
    const html = render(<AlertList />, { institutions, alerts: configs })
    expect(html).toContain('Alpha Bancorp')
    expect(html).toContain('Zeta Trust')
    expect(html).toContain('Inactive')
    expect(html).not.toContain('Unknown bank')
    expect(html).toContain('aria-label="Pause alert for ALFA"')
    expect(html).toContain('aria-label="Delete alert for ALFA"')
    expect(html).toContain('aria-label="Resume alert for ZETA"')
    expect(html).toContain('>Active<')
    expect(html).toContain('>Paused<')
    expect(html).toContain('Stock drop')
    expect(html).toContain('All categories')
    expect(html).toContain('15.0')
    expect(html).not.toContain('%')
  })

  it('explains what fills the empty list', () => {
    const html = render(<AlertList />, { institutions, alerts: [] })
    expect(html).toContain('No alerts yet.')
  })
})

describe('AlertHistoryList', () => {
  it('lists crossings with the reason and a link to the bank', () => {
    const html = render(<AlertHistoryList />, { institutions, history })
    expect(html).toContain('Score 9.2 crossed threshold 8')
    expect(html).toContain('9.2')
    expect(html).toContain('href="/institution/a"')
    expect(html).toMatch(/datetime="2026-11-17T12:15:00Z"/i)
  })

  it('uses the agreed empty copy', () => {
    const html = render(<AlertHistoryList />, { institutions, history: [] })
    expect(html).toContain('No threshold crossings logged yet.')
  })
})

describe('Alerts page', () => {
  it('opens the form from ?institution_id= and sets the document title', () => {
    const html = render(
      <Alerts />,
      { institutions, alerts: configs, history },
      '/alerts?institution_id=b',
    )
    expect(html).toContain('<title>Alerts · Failure Signal</title>')
    expect(html).toContain('id="new-alert-form"')
    expect(html).toMatch(/<option[^>]*value="b"[^>]*selected/)
    expect(html).toContain('aria-expanded="true"')
  })

  it('keeps the form closed by default', () => {
    const html = render(<Alerts />, {
      institutions,
      alerts: configs,
      history,
    })
    expect(html).not.toContain('id="new-alert-form"')
    expect(html).toContain('aria-expanded="false"')
  })
})
