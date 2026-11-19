/**
 * Pagination helper for PostgREST. The live project caps every response at
 * max_rows = 1000 and silently truncates anything larger, so any query that can
 * grow past that must go through fetchAll.
 */

/** The subset of a PostgREST error we keep when turning it into an exception. */
export interface PostgrestErrorLike {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** Thrown for every failed Supabase query so callers can branch on code/status. */
export class QueryError extends Error {
  readonly code: string
  readonly details: string
  readonly hint: string
  /** HTTP status of the response when known. */
  readonly status: number | undefined

  constructor(error: PostgrestErrorLike, status?: number) {
    super(error.message)
    this.name = 'QueryError'
    this.code = error.code ?? ''
    this.details = error.details ?? ''
    this.hint = error.hint ?? ''
    this.status = status
  }
}

/**
 * PostgREST answers 416 / PGRST103 when a `.range()` starts past the last row of
 * a counted (`count: 'exact'`) query. For a pager that is an empty page, not a failure.
 */
export function isRangeNotSatisfiable(
  error: PostgrestErrorLike,
  status?: number,
): boolean {
  return error.code === 'PGRST103' || status === 416
}

/** What one page of results looks like (structurally matches PostgrestResponse<T>). */
export interface PageResult<T> {
  data: T[] | null
  error: PostgrestErrorLike | null
  status?: number
}

/** Anything with a `.range()` that resolves to a page: a PostgrestFilterBuilder<..., T[]> qualifies. */
export interface PageableQuery<T> {
  range(from: number, to: number): PromiseLike<PageResult<T>>
}

/**
 * Fetch every row of a query by paging with `.range()`.
 *
 * `make` MUST build a fresh query each call (supabase-js builders are mutable and
 * single-shot: `.range()` writes onto the builder, so one instance cannot serve
 * two pages). It MUST also apply a deterministic order with a tiebreak, e.g.
 * `.order('snapshot_date').order('institution_id')`, otherwise pages can overlap
 * or skip rows. Stops on the first short page; throws QueryError on any error.
 *
 * @example
 * const rows = await fetchAll(() =>
 *   supabase.from('daily_snapshots').select('institution_id, snapshot_date')
 *     .order('snapshot_date').order('institution_id'))
 */
export async function fetchAll<T>(
  make: () => PageableQuery<T>,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(
      `fetchAll: pageSize must be a positive integer, got ${pageSize}`,
    )
  }
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const res = await make().range(from, from + pageSize - 1)
    if (res.error) throw new QueryError(res.error, res.status)
    const page = res.data ?? []
    for (const row of page) rows.push(row)
    if (page.length < pageSize) return rows
  }
}
