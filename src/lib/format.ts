/**
 * Number and date formatting used by every page (design brief §8).
 *
 * Rules: a missing value is '—' (never 0.0); scores are an index with one
 * decimal and never a '%'; deltas carry their sign; dates are 'MMM d, yyyy';
 * times are UTC with the suffix. ISO date strings ('YYYY-MM-DD') go through
 * parseISO, which yields LOCAL midnight; `new Date('YYYY-MM-DD')` is UTC
 * midnight and shows the previous day in US time zones.
 */
import { format, formatDistanceStrict, isValid, parseISO } from 'date-fns'
import type { FormatDistanceToken, Locale } from 'date-fns'
import { enUS } from 'date-fns/locale'

/** The placeholder for a missing value. */
export const EM_DASH = '—'

export type DateInput = string | Date | null | undefined
export type NumberInput = number | null | undefined

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

/** 'MMM d, yyyy' by default. ISO strings are parsed with parseISO (local midnight). */
export function formatDate(value: DateInput, fmt = 'MMM d, yyyy'): string {
  const date = toDate(value)
  return date ? format(date, fmt) : EM_DASH
}

const UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** '12:15 UTC', or 'Nov 17, 12:15 UTC' with `withDate`. Always clock time in UTC. */
export function formatDateTimeUTC(
  value: DateInput,
  { withDate = false }: { withDate?: boolean } = {},
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  const time = `${hh}:${mm} UTC`
  if (!withDate) return time
  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${time}`
}

const COMPACT_UNITS: Partial<Record<FormatDistanceToken, string>> = {
  xSeconds: 's',
  xMinutes: 'min',
  xHours: 'h',
  xDays: 'd',
  xMonths: 'mo',
  xYears: 'y',
}

/** en-US with compact strict units: '3 h ago', '14 min ago', 'in 2 d'. */
const compactLocale: Locale = {
  ...enUS,
  formatDistance: (token, count, options) => {
    const text = `${count} ${COMPACT_UNITS[token] ?? token}`
    if (!options?.addSuffix) return text
    return options.comparison !== undefined && options.comparison > 0
      ? `in ${text}`
      : `${text} ago`
  },
}

/** '3 h ago' / '14 min ago' / 'in 2 d'. `now` is injectable for tests. */
export function formatRelative(
  value: DateInput,
  now: Date = new Date(),
): string {
  const date = toDate(value)
  if (!date) return EM_DASH
  return formatDistanceStrict(date, now, {
    addSuffix: true,
    locale: compactLocale,
  })
}

/** Risk score index: '6.4', or '—' for a missing score. Never a '%'. */
export function formatScore(score: NumberInput, digits = 1): string {
  return isNum(score) ? score.toFixed(digits) : EM_DASH
}

/**
 * Signed fixed-point: '+1.25', '-1.25'. Zero (including a value that rounds to
 * zero at `digits`) is unsigned, so '-0.00' never appears.
 */
export function formatSigned(
  value: NumberInput,
  digits = 2,
  suffix = '',
): string {
  if (!isNum(value)) return EM_DASH
  const rounded = Number(value.toFixed(digits))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${Math.abs(rounded).toFixed(digits)}${suffix}`
}

/** Signed percentage for genuine percentages (stock change, hit rate, excess return): '+1.25%'. */
export function formatPct(value: NumberInput, digits = 2): string {
  return formatSigned(value, digits, '%')
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/**
 * '+$1,234.56' / '-$1,234.56' for P&L (signed, the default); pass
 * `{ signed: false }` for a price: '$42.10'.
 */
export function formatCurrency(
  value: NumberInput,
  { signed = true }: { signed?: boolean } = {},
): string {
  if (!isNum(value)) return EM_DASH
  const rounded = Math.round(value * 100) / 100
  const magnitude = usd.format(Math.abs(rounded))
  if (rounded < 0) return `-${magnitude}`
  return signed && rounded > 0 ? `+${magnitude}` : magnitude
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Whole-number count with thousands separators: '1,214'. */
export function formatCount(value: NumberInput): string {
  return isNum(value) ? integer.format(value) : EM_DASH
}
