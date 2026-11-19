import { describe, expect, it } from 'vitest'
import { SCORE_MAX } from '@shared/constants'
import { SEVERE, SHORT_ENTRY, SHORT_EXIT, WATCH } from '@shared/thresholds'
import {
  getRiskLevel,
  isElevated,
  RISK_LEVELS,
  riskLevelOf,
  scoreAxisMax,
  scoreDelta,
  scoreTone,
} from './risk'

describe('RISK_LEVELS', () => {
  it('has five contiguous bands from 0 to SCORE_MAX derived from the thresholds', () => {
    expect(RISK_LEVELS.map((l) => l.label)).toEqual([
      'Low',
      'Guarded',
      'Elevated',
      'High',
      'Critical',
    ])
    expect(RISK_LEVELS.map((l) => l.max)).toEqual([
      SHORT_EXIT,
      WATCH,
      SHORT_ENTRY,
      SEVERE,
      SCORE_MAX,
    ])
    expect(RISK_LEVELS[0].min).toBe(0)
    for (let i = 1; i < RISK_LEVELS.length; i++)
      expect(RISK_LEVELS[i].min).toBe(RISK_LEVELS[i - 1].max)
  })

  it('maps each band to its risk token and a hex colour', () => {
    expect(RISK_LEVELS.map((l) => l.token)).toEqual([
      'risk-1',
      'risk-2',
      'risk-3',
      'risk-4',
      'risk-5',
    ])
    for (const level of RISK_LEVELS)
      expect(level.color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('getRiskLevel', () => {
  it.each([
    [0, 'Low'],
    [4.99, 'Low'],
    [SHORT_EXIT, 'Guarded'],
    [7.99, 'Guarded'],
    [WATCH, 'Elevated'],
    [14.99, 'Elevated'],
    [SHORT_ENTRY, 'High'],
    [24.99, 'High'],
    [SEVERE, 'Critical'],
    [33.5, 'Critical'],
    [SCORE_MAX, 'Critical'],
    [150, 'Critical'],
    [-1, 'Low'],
    [Number.NaN, 'Low'],
  ])('%s -> %s (half-open intervals, score < max)', (score, label) => {
    expect(getRiskLevel(score).label).toBe(label)
  })

  it('returns the same objects as RISK_LEVELS', () => {
    expect(getRiskLevel(WATCH)).toBe(RISK_LEVELS[2])
  })
})

describe('null handling', () => {
  it('riskLevelOf returns null for a missing score', () => {
    expect(riskLevelOf(null)).toBeNull()
    expect(riskLevelOf(undefined)).toBeNull()
    expect(riskLevelOf(6.4)?.label).toBe('Guarded')
  })

  it('scoreTone is neutral for a missing score and the band token otherwise', () => {
    expect(scoreTone(null)).toBe('neutral')
    expect(scoreTone(undefined)).toBe('neutral')
    expect(scoreTone(0)).toBe('risk-1')
    expect(scoreTone(SEVERE)).toBe('risk-5')
  })

  it('isElevated is score >= WATCH and never true for null', () => {
    expect(isElevated(null)).toBe(false)
    expect(isElevated(WATCH - 0.01)).toBe(false)
    expect(isElevated(WATCH)).toBe(true)
  })

  it('scoreDelta is null when either side is missing', () => {
    expect(scoreDelta(6, null)).toBeNull()
    expect(scoreDelta(null, 6)).toBeNull()
    expect(scoreDelta(6.5, 4)).toBeCloseTo(2.5)
  })
})

describe('scoreAxisMax', () => {
  it('never drops below SEVERE and adds 20% headroom', () => {
    expect(scoreAxisMax([])).toBe(SEVERE)
    expect(scoreAxisMax([1, 6.4, 3])).toBe(SEVERE)
    expect(scoreAxisMax([33.5])).toBe(Math.ceil(33.5 * 1.2))
    expect(scoreAxisMax([Number.NaN, 30])).toBe(36)
  })
})
