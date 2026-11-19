export type SortDir = 'asc' | 'desc'

export interface SortState {
  key: string
  dir: SortDir
}

export type SortValue = number | string | boolean | null | undefined

export function isMissing(value: SortValue): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && Number.isNaN(value))
  )
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean')
    return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en', {
    numeric: true,
    sensitivity: 'base',
  })
}

/**
 * Stable sort by a derived value. Missing values (null/undefined/NaN) go last
 * in both directions so "sort by score" never leads with unscored banks.
 */
export function sortRows<T>(
  rows: readonly T[],
  sortValue: ((row: T) => SortValue) | undefined,
  dir: SortDir,
): T[] {
  if (!sortValue) return [...rows]
  const decorated = rows.map((row, index) => ({
    row,
    index,
    value: sortValue(row),
  }))
  decorated.sort((a, b) => {
    const aMissing = isMissing(a.value)
    const bMissing = isMissing(b.value)
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return a.index - b.index
      return aMissing ? 1 : -1
    }
    const order = compareValues(a.value, b.value)
    return (dir === 'asc' ? order : -order) || a.index - b.index
  })
  return decorated.map((entry) => entry.row)
}
