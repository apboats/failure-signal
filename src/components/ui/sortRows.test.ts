import { describe, expect, it } from 'vitest'
import { sortRows } from './sortRows'

interface Row {
  id: string
  score: number | null
  name: string
}

const rows: Row[] = [
  { id: 'a', score: 6.4, name: 'Bank 10' },
  { id: 'b', score: null, name: 'bank 2' },
  { id: 'c', score: 12, name: 'Bank 1' },
  { id: 'd', score: Number.NaN, name: 'Zeta' },
  { id: 'e', score: 6.4, name: 'Alpha' },
]

const ids = (sorted: Row[]) => sorted.map((row) => row.id)

describe('sortRows', () => {
  it('puts missing values last in both directions and keeps ties stable', () => {
    expect(ids(sortRows(rows, (r) => r.score, 'desc'))).toEqual([
      'c',
      'a',
      'e',
      'b',
      'd',
    ])
    expect(ids(sortRows(rows, (r) => r.score, 'asc'))).toEqual([
      'a',
      'e',
      'c',
      'b',
      'd',
    ])
  })

  it('compares strings case-insensitively and numerically', () => {
    expect(ids(sortRows(rows, (r) => r.name, 'asc'))).toEqual([
      'e',
      'c',
      'b',
      'a',
      'd',
    ])
  })

  it('returns a copy in the original order without a sort value', () => {
    const copy = sortRows(rows, undefined, 'asc')
    expect(ids(copy)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(copy).not.toBe(rows)
  })
})
