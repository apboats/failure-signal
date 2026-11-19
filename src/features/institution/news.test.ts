import { describe, expect, it } from 'vitest'
import { displaySummary } from './news'

describe('displaySummary', () => {
  it('passes a real summary through, trimmed', () => {
    expect(displaySummary('  Bank raises capital.  ')).toBe(
      'Bank raises capital.',
    )
  })

  it('hides pipeline failure text stored in the summary column', () => {
    expect(
      displaySummary(
        '[Analysis failed: Error: 404 {"type":"error","error":{"type":"not_found_error"}}]',
      ),
    ).toBeNull()
  })

  it('returns null for null, undefined and whitespace', () => {
    expect(displaySummary(null)).toBeNull()
    expect(displaySummary(undefined)).toBeNull()
    expect(displaySummary('   ')).toBeNull()
  })
})
