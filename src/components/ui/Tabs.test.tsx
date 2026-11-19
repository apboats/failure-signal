import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './tabNav'
import { Tabs } from './Tabs'
import { useTabParam, withTabParam } from './useTabParam'

const TAB_IDS = ['signals', 'positions'] as const

function Harness() {
  const [tab, setTab] = useTabParam(TAB_IDS)
  return (
    <Tabs
      tabs={[
        { id: 'signals', label: 'Signals' },
        { id: 'positions', label: 'Positions', count: 3 },
      ]}
      value={tab}
      onChange={setTab}
    />
  )
}

const at = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Harness />
    </MemoryRouter>,
  )

describe('Tabs + useTabParam', () => {
  it('selects the tab named by ?tab= with a roving tabindex', () => {
    const out = at('/trading?tab=positions&institution_id=x')
    expect(out).toMatch(
      /id="tab-positions" aria-selected="true" aria-controls="tabpanel-positions" tabindex="0"/,
    )
    expect(out).toMatch(
      /id="tab-signals" aria-selected="false"[^>]*tabindex="-1"/,
    )
    expect(out).toContain('role="tablist"')
    expect(out).toContain('>3<')
  })

  it('falls back to the first tab when the param is missing or unknown', () => {
    expect(at('/trading')).toMatch(/id="tab-signals" aria-selected="true"/)
    expect(at('/trading?tab=bogus')).toMatch(
      /id="tab-signals" aria-selected="true"/,
    )
  })

  it('writes the tab back without dropping other params', () => {
    const next = withTabParam(
      new URLSearchParams('tab=positions&institution_id=x'),
      'tab',
      'signals',
    )
    expect(next.toString()).toBe('tab=signals&institution_id=x')
    expect(
      withTabParam(new URLSearchParams(''), 'tab', 'positions').toString(),
    ).toBe('tab=positions')
  })
})

describe('nextTabIndex', () => {
  it('moves with arrows (wrapping) and Home/End, ignoring other keys', () => {
    expect(nextTabIndex('ArrowRight', 0, 2)).toBe(1)
    expect(nextTabIndex('ArrowRight', 1, 2)).toBe(0)
    expect(nextTabIndex('ArrowLeft', 0, 2)).toBe(1)
    expect(nextTabIndex('Home', 1, 3)).toBe(0)
    expect(nextTabIndex('End', 0, 3)).toBe(2)
    expect(nextTabIndex('Enter', 0, 3)).toBeNull()
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull()
  })
})
