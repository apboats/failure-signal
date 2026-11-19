import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { caseStudies } from '@/content/caseStudies'
import { Playbook } from '@/pages/Playbook'

/** React's text escaping, so a title with quotes or an ampersand is found in the markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function render(search = '') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/playbook${search}`]}>
      <Playbook />
    </MemoryRouter>,
  )
}

describe('Playbook page', () => {
  it.each(caseStudies.map((study) => [study.id, study] as const))(
    'renders every %s event exactly once, with no mobile/desktop duplication',
    (id, study) => {
      const html = render(`?study=${id}`)
      for (const event of study.timeline) {
        expect(count(html, escapeHtml(event.title))).toBe(1)
        expect(count(html, escapeHtml(event.description))).toBe(1)
      }
      expect(html).toContain(escapeHtml(study.summary))
      expect(html).toContain(escapeHtml(study.outcome))
      for (const lesson of study.lessons)
        expect(html).toContain(escapeHtml(lesson.threshold))
      // Built from parts so the source itself never carries a banned class name.
      for (const banned of ['md:' + 'hidden', 'hidden md:', 'text-[' + '10px]'])
        expect(html).not.toContain(banned)
      // The only inline colours are the SIGNAL_CATEGORIES dots beside category labels
      // (the chart container's own width/height style carries no colour).
      const colourStyles = (html.match(/style="[^"]*"/g) ?? []).filter((s) =>
        s.includes('#'),
      )
      for (const style of colourStyles)
        expect(style).toMatch(/^style="background-color:#[0-9a-f]{6}"$/)
      expect(colourStyles).toHaveLength(study.timeline.length)
    },
  )

  it('defaults to SVB, sets the document title and keeps the heading order', () => {
    const html = render()
    expect(html).toContain('<title>Playbook · Failure Signal</title>')
    expect(html).toContain('>Silicon Valley Bank</span>')
    expect(html).not.toContain('>Bear Stearns</span>')
    expect(count(html, '<h1')).toBe(1)
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('<h3'))
    expect(html).not.toContain('<h4')
  })

  it('shows the first firing date per threshold and a dash when it never fired', () => {
    const html = render('?study=bear')
    expect(html).toContain('dateTime="2008-03-10"')
    expect(html).toContain('dateTime="2008-03-13"')
    expect(html).toContain('never fired')
  })
})
