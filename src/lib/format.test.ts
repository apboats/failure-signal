import { describe, expect, it } from 'vitest'
import {
  EM_DASH,
  formatCount,
  formatCurrency,
  formatDate,
  formatDateTimeUTC,
  formatPct,
  formatRelative,
  formatScore,
  formatSigned,
} from './format'

describe('formatDate', () => {
  it("parses 'YYYY-MM-DD' as local midnight so the day never shifts", () => {
    // new Date('2026-11-17') would be UTC midnight (Nov 16 evening in US zones).
    expect(formatDate('2026-11-17')).toBe('Nov 17, 2026')
    expect(formatDate('2026-11-17', 'yyyy-MM-dd')).toBe('2026-11-17')
    expect(formatDate('2026-01-01', 'yyyy-MM-dd')).toBe('2026-01-01')
  })

  it('accepts timestamps and Date instances', () => {
    expect(formatDate('2026-11-17T12:15:00Z', 'yyyy')).toBe('2026')
    expect(formatDate(new Date(2026, 10, 17), 'MMM d')).toBe('Nov 17')
  })

  it('returns the dash for null, empty and invalid input', () => {
    expect(formatDate(null)).toBe(EM_DASH)
    expect(formatDate(undefined)).toBe(EM_DASH)
    expect(formatDate('')).toBe(EM_DASH)
    expect(formatDate('not a date')).toBe(EM_DASH)
    expect(formatDate(new Date(Number.NaN))).toBe(EM_DASH)
  })
})

describe('formatDateTimeUTC', () => {
  it('renders clock time in UTC with the suffix', () => {
    expect(formatDateTimeUTC('2026-11-17T12:15:00Z')).toBe('12:15 UTC')
    expect(formatDateTimeUTC('2026-11-17T07:15:30-05:00')).toBe('12:15 UTC')
    expect(formatDateTimeUTC('2026-11-17T00:05:00Z')).toBe('00:05 UTC')
  })

  it('prefixes the UTC calendar date on request', () => {
    expect(
      formatDateTimeUTC('2026-11-17T23:40:00-02:00', { withDate: true }),
    ).toBe('Nov 18, 01:40 UTC')
  })

  it('returns the dash for missing input', () => {
    expect(formatDateTimeUTC(null)).toBe(EM_DASH)
    expect(formatDateTimeUTC('nope')).toBe(EM_DASH)
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-11-17T12:00:00Z')

  it('uses compact strict units', () => {
    expect(formatRelative('2026-11-17T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative('2026-11-17T11:46:00Z', now)).toBe('14 min ago')
    expect(formatRelative('2026-11-17T11:59:20Z', now)).toBe('40 s ago')
    expect(formatRelative('2026-11-15T12:00:00Z', now)).toBe('2 d ago')
    expect(formatRelative('2026-08-17T12:00:00Z', now)).toBe('3 mo ago')
    expect(formatRelative('2024-11-17T12:00:00Z', now)).toBe('2 y ago')
  })

  it('handles future timestamps and missing input', () => {
    expect(formatRelative('2026-11-17T12:05:00Z', now)).toBe('in 5 min')
    expect(formatRelative(null, now)).toBe(EM_DASH)
  })
})

describe('formatScore', () => {
  it('renders one decimal with no percent sign', () => {
    expect(formatScore(6.39)).toBe('6.4')
    expect(formatScore(0)).toBe('0.0')
    expect(formatScore(33.5)).toBe('33.5')
    expect(formatScore(12, 0)).toBe('12')
  })

  it('renders the dash for a missing or non-finite score', () => {
    expect(formatScore(null)).toBe(EM_DASH)
    expect(formatScore(undefined)).toBe(EM_DASH)
    expect(formatScore(Number.NaN)).toBe(EM_DASH)
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe(EM_DASH)
  })
})

describe('formatSigned', () => {
  it('carries the sign on both sides of zero', () => {
    expect(formatSigned(1.25)).toBe('+1.25')
    expect(formatSigned(-1.25)).toBe('-1.25')
    expect(formatSigned(2.5, 1)).toBe('+2.5')
    expect(formatSigned(-0.4, 1, ' pts')).toBe('-0.4 pts')
  })

  it('leaves zero unsigned, including values that round to zero', () => {
    expect(formatSigned(0)).toBe('0.00')
    expect(formatSigned(-0)).toBe('0.00')
    expect(formatSigned(-0.001)).toBe('0.00')
    expect(formatSigned(0.004, 2)).toBe('0.00')
  })

  it('returns the dash for missing input', () => {
    expect(formatSigned(null)).toBe(EM_DASH)
    expect(formatSigned(Number.NaN)).toBe(EM_DASH)
  })
})

describe('formatPct', () => {
  it('appends a percent sign to a signed number', () => {
    expect(formatPct(1.25)).toBe('+1.25%')
    expect(formatPct(-3)).toBe('-3.00%')
    expect(formatPct(0)).toBe('0.00%')
    expect(formatPct(12.345, 1)).toBe('+12.3%')
    expect(formatPct(null)).toBe(EM_DASH)
  })
})

describe('formatCurrency', () => {
  it('signs P&L by default', () => {
    expect(formatCurrency(1234.56)).toBe('+$1,234.56')
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56')
    expect(formatCurrency(0)).toBe('$0.00')
    expect(formatCurrency(-0.001)).toBe('$0.00')
  })

  it('renders prices unsigned on request', () => {
    expect(formatCurrency(42.1, { signed: false })).toBe('$42.10')
    expect(formatCurrency(-42.1, { signed: false })).toBe('-$42.10')
  })

  it('returns the dash for missing input', () => {
    expect(formatCurrency(null)).toBe(EM_DASH)
    expect(formatCurrency(undefined)).toBe(EM_DASH)
  })
})

describe('formatCount', () => {
  it('formats whole numbers with separators', () => {
    expect(formatCount(1214)).toBe('1,214')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(314_000)).toBe('314,000')
    expect(formatCount(12.6)).toBe('13')
  })

  it('returns the dash for missing input', () => {
    expect(formatCount(null)).toBe(EM_DASH)
    expect(formatCount(Number.NaN)).toBe(EM_DASH)
  })
})
