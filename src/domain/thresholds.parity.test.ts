import { describe, expect, it } from 'vitest'
import * as shared from '@shared/thresholds'
import sharedSource from '@shared/thresholds.ts?raw'
// No alias covers supabase/functions, so this one import is relative.
import * as mirror from '../../supabase/functions/_shared/thresholds'
import mirrorSource from '../../supabase/functions/_shared/thresholds.ts?raw'

/**
 * shared/thresholds.ts is copied byte-for-byte to
 * supabase/functions/_shared/thresholds.ts so the browser app and the Deno
 * edge functions agree on every band edge. Editing one without the other
 * fails here. Fix: copy the edited file over the other one.
 */
describe('thresholds parity', () => {
  it('the Deno mirror is a byte-identical copy of shared/thresholds.ts', () => {
    expect(mirrorSource).toBe(sharedSource)
  })

  it('both modules export the same names with the same values', () => {
    expect({ ...mirror }).toEqual({ ...shared })
    expect(Object.keys(shared).sort()).toEqual([
      'SCORE_SPIKE',
      'SEVERE',
      'SHORT_ENTRY',
      'SHORT_EXIT',
      'WATCH',
    ])
  })

  it('the band edges are ordered and numeric', () => {
    expect(shared.SHORT_EXIT).toBeLessThan(shared.WATCH)
    expect(shared.WATCH).toBeLessThan(shared.SHORT_ENTRY)
    expect(shared.SHORT_ENTRY).toBeLessThan(shared.SEVERE)
    expect(shared.SCORE_SPIKE).toBeGreaterThan(0)
  })
})
