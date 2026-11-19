import type { Institution } from '@shared/types'

/** Short label for headings: the ticker, or the name when there is no ticker. */
export function bankLabel(
  institution: Institution | undefined,
  fallback = 'this bank',
): string {
  if (!institution) return fallback
  return institution.ticker ?? institution.name
}
