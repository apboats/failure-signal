import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'
import { DataTable, type Column } from './DataTable'
import { ScoreValue } from './ScoreValue'

/*
 * Markup assertions in the node environment: jsdom 31 needs undici 8, which
 * fails to load on Node < 22.15 (zlib.createZstdDecompress). The keyboard
 * behaviour follows from the elements: a <button> and an <a href> are
 * reachable with Tab and activated with Enter by the browser itself.
 */

interface Row {
  id: string
  ticker: string
  score: number | null
}

const rows: Row[] = [
  { id: '1', ticker: 'AAA', score: 6.4 },
  { id: '2', ticker: 'BBB', score: null },
  { id: '3', ticker: 'CCC', score: 12 },
]

const columns: Column<Row>[] = [
  {
    key: 'ticker',
    header: 'Ticker',
    mobileRole: 'primary',
    sortValue: (row) => row.ticker,
    render: (row) => row.ticker,
  },
  {
    key: 'score',
    header: 'Score',
    numeric: true,
    sortValue: (row) => row.score,
    render: (row) => <ScoreValue score={row.score} />,
  },
]

const html = (ui: ReactElement) =>
  renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)

const tickerOrder = (out: string) =>
  ['AAA', 'BBB', 'CCC'].sort((a, b) => out.indexOf(a) - out.indexOf(b))

describe('DataTable', () => {
  it('renders sortable headers as a <button> inside <th aria-sort> and sorts missing scores last', () => {
    const out = html(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        defaultSort={{ key: 'score', dir: 'desc' }}
        emptyState="empty"
      />,
    )
    expect(out).toMatch(
      /<th scope="col" aria-sort="descending"[^>]*><button type="button"/,
    )
    expect(out).toMatch(
      /<th scope="col" aria-sort="none"[^>]*><button type="button"/,
    )
    expect(tickerOrder(out)).toEqual(['CCC', 'AAA', 'BBB'])
  })

  it('sorts ascending with missing values still last', () => {
    const out = html(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        defaultSort={{ key: 'score', dir: 'asc' }}
        emptyState="empty"
      />,
    )
    expect(out).toMatch(/aria-sort="ascending"/)
    expect(tickerOrder(out)).toEqual(['AAA', 'CCC', 'BBB'])
  })

  it('puts a keyboard-operable <button> on the primary cell of clickable rows', () => {
    const out = html(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={() => {}}
        emptyState="empty"
      />,
    )
    expect(out).toMatch(
      /<td[^>]*><button type="button"[^>]*>AAA<\/button><\/td>/,
    )
    expect(out).toMatch(/<tr[^>]*cursor-pointer/)
  })

  it('renders rowTo as a link on the primary cell', () => {
    const out = html(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowTo={(row) => `/institution/${row.id}`}
        emptyState="empty"
      />,
    )
    expect(out).toMatch(
      /<a[^>]*data-row-link=""[^>]*href="\/institution\/2"[^>]*>BBB<\/a>/,
    )
  })

  it('shows the empty state instead of a table', () => {
    const out = html(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyState={<p>No banks match</p>}
      />,
    )
    expect(out).not.toContain('<table')
    expect(out).toContain('No banks match')
  })

  it('hides columns below their breakpoint and labels secondary cells for the mobile collapse', () => {
    const out = html(
      <DataTable
        columns={[
          ...columns,
          { key: 'name', header: 'Name', hideBelow: 'md', render: () => 'x' },
        ]}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState="empty"
      />,
    )
    expect(out).toContain('max-md:hidden')
    expect(out).toMatch(
      /<span class="text-xs text-muted md:hidden">Score<\/span>/,
    )
  })
})

describe('Badge', () => {
  it("tone 'risk-3' renders the orange risk-3 tint", () => {
    const out = renderToStaticMarkup(<Badge tone="risk-3">Elevated</Badge>)
    expect(out).toContain('bg-risk-3/15')
    expect(out).toContain('text-risk-3')
    expect(out).toContain('rounded-full')
  })
})

describe('ScoreValue', () => {
  it('renders one decimal tinted by band and a dash for null', () => {
    expect(renderToStaticMarkup(<ScoreValue score={12} />)).toMatch(
      /text-risk-3[^>]*>12\.0/,
    )
    const missing = renderToStaticMarkup(<ScoreValue score={null} withLevel />)
    expect(missing).toMatch(/text-muted[^>]*>—/)
    expect(missing).toContain('No score')
    expect(missing).not.toContain('%')
  })
})
