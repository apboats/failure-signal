import { describe, expect, it } from 'vitest'
import {
  classifyInstitution,
  normalizeCompanyName,
  type ClassifierInput,
  type SecRecord,
} from './bankClassifier.ts'

function sec(overrides: Partial<SecRecord>): SecRecord {
  return {
    cik: '0000000001',
    sic: null,
    sicDescription: null,
    exchanges: ['NYSE'],
    stateOrCountry: 'NY',
    ...overrides,
  }
}

function classify(overrides: Partial<ClassifierInput>) {
  return classifyInstitution({
    name: 'Example',
    ticker: 'EXM',
    sector: 'banking',
    sec: null,
    matchedBy: 'ticker',
    ...overrides,
  })
}

describe('classifyInstitution', () => {
  it('rates a listed US commercial bank near certain', () => {
    const out = classify({
      sec: sec({ sic: '6021', sicDescription: 'National Commercial Banks' }),
    })
    expect(out.probability).toBe(0.99)
    expect(out.reasons.join(' ')).toContain('is a bank code')
  })

  it('rates a small OTC savings bank as likely', () => {
    const out = classify({
      sec: sec({ sic: '6036', exchanges: ['OTC'], stateOrCountry: 'PA' }),
    })
    expect(out.probability).toBeGreaterThanOrEqual(0.7)
    expect(out.probability).toBeLessThan(0.99)
  })

  it('rates a consumer-loan marketplace like Upstart as unlikely', () => {
    const out = classify({
      sector: 'fintech',
      sec: sec({
        sic: '6141',
        sicDescription: 'Personal Credit Institutions',
        exchanges: ['Nasdaq'],
        stateOrCountry: 'CA',
      }),
    })
    expect(out.probability).toBeLessThan(0.35)
    expect(out.reasons.join(' ')).toContain('not a bank')
  })

  it('rates a payments company outside financial SIC codes as unlikely', () => {
    const out = classify({
      sector: 'fintech',
      sec: sec({
        sic: '7372',
        sicDescription: 'Services-Prepackaged Software',
        stateOrCountry: 'CA',
      }),
    })
    expect(out.probability).toBeLessThan(0.35)
  })

  it('rates an insurer lowest among SEC registrants', () => {
    const insurer = classify({ sector: 'insurance', sec: sec({ sic: '6311' }) })
    const lender = classify({ sector: 'fintech', sec: sec({ sic: '6141' }) })
    expect(insurer.probability).toBeLessThan(lender.probability)
  })

  it('penalises a foreign headquarters', () => {
    const us = classify({ sec: sec({ sic: '6029', stateOrCountry: 'NY' }) })
    const foreign = classify({
      sec: sec({ sic: '6029', stateOrCountry: 'X0' }),
    })
    expect(foreign.probability).toBeLessThan(us.probability)
    expect(foreign.reasons.join(' ')).toContain('outside the US')
  })

  it('treats a company missing from the SEC list as very unlikely', () => {
    const withTicker = classify({ sec: null, ticker: 'BKKLY' })
    expect(withTicker.probability).toBeLessThanOrEqual(0.1)
    expect(withTicker.reasons[0]).toContain('not in the SEC company list')
    const noTicker = classify({ sec: null, ticker: null, matchedBy: null })
    expect(noTicker.reasons[0]).toContain('likely private or foreign')
  })

  it('always stays inside 0.01..0.99 with three decimals', () => {
    const low = classify({
      sector: 'insurance',
      sec: sec({ sic: '6311', exchanges: ['OTC'], stateOrCountry: 'X0' }),
    })
    expect(low.probability).toBeGreaterThanOrEqual(0.01)
    const high = classify({ sec: sec({ sic: '6022' }) })
    expect(high.probability).toBeLessThanOrEqual(0.99)
    expect(Number.isInteger(high.probability * 1000)).toBe(true)
  })
})

describe('normalizeCompanyName', () => {
  it('drops legal suffixes, punctuation and case', () => {
    expect(normalizeCompanyName('Upstart Holdings, Inc.')).toBe('upstart')
    expect(normalizeCompanyName('UPSTART HOLDINGS, INC.')).toBe('upstart')
    expect(normalizeCompanyName('Bread Financial Holdings, Inc.')).toBe(
      'bread financial',
    )
    expect(normalizeCompanyName('M&amp;T Bank Corp')).toBe('m&t bank')
  })
})
