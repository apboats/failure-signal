import { describe, expect, it } from 'vitest'
import { SEVERE } from '@shared/thresholds'
import { scoreDomain, seriesColors } from './chartTheme'

describe('scoreDomain', () => {
  it('starts at 0 and is floored at SEVERE, never a fixed 100', () => {
    expect(scoreDomain[0]).toBe(0)
    expect(scoreDomain[1](0)).toBe(SEVERE)
    expect(scoreDomain[1](6.4)).toBe(SEVERE)
    expect(scoreDomain[1](20)).toBe(SEVERE)
    expect(scoreDomain[1](90)).toBe(Math.ceil(90 * 1.2))
    expect(scoreDomain[1](90)).not.toBe(100)
  })
})

describe('seriesColors', () => {
  it('only references theme tokens', () => {
    for (const color of seriesColors)
      expect(color).toMatch(/^var\(--color-chart-\d\)$/)
  })
})
