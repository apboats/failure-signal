import type { PositionDirection } from '@shared/types'

/** Values a link can seed the position form with (?institution_id=&direction=&price=). */
export interface PositionPrefill {
  institutionId?: string
  direction?: PositionDirection
  /** Positive finite price; anything else is dropped. */
  price?: number
}

export const PREFILL_PARAMS = ['institution_id', 'direction', 'price'] as const

export function readPositionPrefill(params: URLSearchParams): PositionPrefill {
  const prefill: PositionPrefill = {}
  const institutionId = params.get('institution_id')
  if (institutionId) prefill.institutionId = institutionId
  const direction = params.get('direction')
  if (direction === 'short' || direction === 'long')
    prefill.direction = direction
  const price = Number(params.get('price'))
  if (params.has('price') && Number.isFinite(price) && price > 0)
    prefill.price = price
  return prefill
}

/** A copy of `params` without the prefill keys (keeps ?tab= and anything else). */
export function withoutPrefill(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const key of PREFILL_PARAMS) next.delete(key)
  return next
}

/**
 * Search string for the "Open position" action: the Positions tab with the
 * form seeded for a short at `price` (omitted when unknown).
 */
export function openPositionSearch(
  institutionId: string,
  direction: PositionDirection,
  price: number | null | undefined,
): string {
  const params = new URLSearchParams({
    tab: 'positions',
    institution_id: institutionId,
    direction,
  })
  if (typeof price === 'number' && Number.isFinite(price) && price > 0)
    params.set('price', String(price))
  return `?${params.toString()}`
}

/** The operator's local calendar day as 'YYYY-MM-DD' (never the UTC day: evening trades are dated today). */
export function todayLocal(now: Date = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** True for a complete 'YYYY-MM-DD' that is a real calendar date. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  )
}

/** Parse a number input's string; null for empty, NaN or infinite. */
export function parseNumberInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
