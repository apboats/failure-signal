import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** A copy of `prev` with `param` set to `next`; every other param is kept in place. */
export function withTabParam(
  prev: URLSearchParams,
  param: string,
  next: string,
): URLSearchParams {
  const params = new URLSearchParams(prev)
  params.set(param, next)
  return params
}

/**
 * Current tab from the `?tab=` search param (first id when absent or unknown)
 * and a setter that writes it back with history.replace, keeping every other
 * param. Pair with <Tabs value onChange>.
 */
export function useTabParam<T extends string>(
  ids: readonly T[],
  param = 'tab',
): [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(param)
  const value =
    raw !== null && (ids as readonly string[]).includes(raw)
      ? (raw as T)
      : ids[0]
  const setValue = useCallback(
    (next: T) => {
      setSearchParams((prev) => withTabParam(prev, param, next), {
        replace: true,
      })
    },
    [param, setSearchParams],
  )
  return [value, setValue]
}
