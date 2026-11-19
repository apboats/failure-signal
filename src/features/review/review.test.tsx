import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Institution } from '@shared/types'
import { CandidateTable } from './CandidateTable'
import { likelihoodLabel } from './likelihood'

/* Markup assertions in the node environment, like the other feature tests. */

function candidate(
  id: string,
  name: string,
  probability: number | null,
): Institution {
  return {
    id,
    name,
    ticker: id.toUpperCase(),
    sector: 'banking',
    description: null,
    logo_url: null,
    is_active: false,
    cik: null,
    created_at: '2026-11-19T00:00:00Z',
    updated_at: '2026-11-19T00:00:00Z',
    discovered_at: '2026-11-19T00:00:00Z',
    review_status: 'pending',
    reviewed_at: null,
    us_bank_probability: probability,
    review_evidence:
      probability === null
        ? null
        : {
            sic: '6022',
            sic_description: 'State commercial banks',
            exchanges: ['Nasdaq'],
            state_or_country: 'AL',
            reasons: ['Industry code 6022 is a bank code'],
          },
  }
}

describe('likelihoodLabel', () => {
  it('maps the estimate to a badge and a whole-number percent', () => {
    expect(likelihoodLabel(0.99)).toEqual({
      label: 'Likely a US bank',
      tone: 'accent',
      percent: '99%',
    })
    expect(likelihoodLabel(0.5).label).toBe('Possibly a US bank')
    expect(likelihoodLabel(0.25)).toMatchObject({
      label: 'Unlikely a US bank',
      tone: 'neutral',
    })
    expect(likelihoodLabel(null)).toEqual({
      label: 'Not checked yet',
      tone: 'neutral',
      percent: '—',
    })
  })
})

describe('CandidateTable', () => {
  const render = (
    status: 'pending' | 'ignored' | 'approved',
    rows: Institution[],
  ) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <CandidateTable
          status={status}
          rows={rows}
          mentions={new Map([['fusb', { news: 12, signals: 3 }]])}
          mentionsLoading={false}
          savingId={null}
          onDecide={() => {}}
        />
      </MemoryRouter>,
    )

  it('shows likelihood, SEC evidence, mentions and Track/Ignore for pending rows', () => {
    const html = render('pending', [
      candidate('fusb', 'First US Bancshares', 0.99),
      candidate('xyz', 'Block', null),
    ])
    expect(html).toContain('99%')
    expect(html).toContain('Likely a US bank')
    expect(html).toContain('Not checked yet')
    expect(html).toContain('State commercial banks · Nasdaq · AL')
    expect(html).toContain('12 articles · 3 signals')
    expect(html).toContain('aria-label="Track First US Bancshares"')
    expect(html).toContain('aria-label="Ignore Block"')
  })

  it('offers restore actions on the ignored tab and stop tracking on the tracked tab', () => {
    expect(render('ignored', [candidate('a', 'Alpha', 0.2)])).toContain(
      'Back to pending',
    )
    expect(render('approved', [candidate('a', 'Alpha', 0.9)])).toContain(
      'Stop tracking',
    )
  })

  it('explains an empty queue', () => {
    expect(render('pending', [])).toContain('Nothing waiting for review.')
  })
})
