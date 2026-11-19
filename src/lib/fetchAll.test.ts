import { describe, expect, it } from 'vitest'
import {
  fetchAll,
  QueryError,
  type PageableQuery,
  type PageResult,
} from './fetchAll'

interface Row {
  n: number
}

/** A fake PostgREST source: each make() returns a single-shot builder over `rows`. */
function fakeSource(total: number, opts: { failOnPage?: number } = {}) {
  const rows: Row[] = Array.from({ length: total }, (_, n) => ({ n }))
  const calls: Array<[number, number]> = []
  let builders = 0
  const make = (): PageableQuery<Row> => {
    builders += 1
    return {
      range(from, to): Promise<PageResult<Row>> {
        calls.push([from, to])
        if (opts.failOnPage === calls.length) {
          return Promise.resolve({
            data: null,
            error: {
              message: 'boom',
              code: 'PGRST000',
              details: 'd',
              hint: 'h',
            },
            status: 500,
          })
        }
        return Promise.resolve({
          data: rows.slice(from, to + 1),
          error: null,
          status: 200,
        })
      },
    }
  }
  return { make, calls, builders: () => builders }
}

describe('fetchAll', () => {
  it('returns [] after one request when the table is empty', async () => {
    const src = fakeSource(0)
    await expect(fetchAll(src.make)).resolves.toEqual([])
    expect(src.calls).toEqual([[0, 999]])
  })

  it('returns a short first page without a second request', async () => {
    const src = fakeSource(42)
    const rows = await fetchAll(src.make)
    expect(rows).toHaveLength(42)
    expect(src.calls).toEqual([[0, 999]])
  })

  it('needs a second (empty) page to know exactly 1000 rows is everything', async () => {
    const src = fakeSource(1000)
    const rows = await fetchAll(src.make)
    expect(rows).toHaveLength(1000)
    expect(rows[999]).toEqual({ n: 999 })
    expect(src.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('fetches 1001 rows in two pages, in order, without duplicates', async () => {
    const src = fakeSource(1001)
    const rows = await fetchAll(src.make)
    expect(rows).toHaveLength(1001)
    expect(rows.map((r) => r.n)).toEqual(
      Array.from({ length: 1001 }, (_, n) => n),
    )
    expect(src.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('builds a fresh query for every page (builders are single-shot)', async () => {
    const src = fakeSource(2500)
    const rows = await fetchAll(src.make)
    expect(rows).toHaveLength(2500)
    expect(src.calls).toHaveLength(3)
    expect(src.builders()).toBe(3)
  })

  it('honours a custom page size', async () => {
    const src = fakeSource(7)
    const rows = await fetchAll(src.make, 3)
    expect(rows).toHaveLength(7)
    expect(src.calls).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ])
  })

  it('rejects an invalid page size', async () => {
    const src = fakeSource(1)
    await expect(fetchAll(src.make, 0)).rejects.toBeInstanceOf(RangeError)
    await expect(fetchAll(src.make, 1.5)).rejects.toBeInstanceOf(RangeError)
    expect(src.calls).toEqual([])
  })

  it('propagates a PostgREST error as a QueryError and stops paging', async () => {
    const src = fakeSource(2500, { failOnPage: 2 })
    const promise = fetchAll(src.make)
    await expect(promise).rejects.toBeInstanceOf(QueryError)
    await expect(promise).rejects.toMatchObject({
      message: 'boom',
      code: 'PGRST000',
      details: 'd',
      hint: 'h',
      status: 500,
      name: 'QueryError',
    })
    expect(src.calls).toHaveLength(2)
  })
})
