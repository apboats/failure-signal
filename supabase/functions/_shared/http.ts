/**
 * `fetch` with logging and a bounded retry for third-party APIs (Finnhub,
 * GNews, SEC, Yahoo). A silent `if (!response.ok) return null` hides a 401
 * from a bad key behind the same null as an unknown ticker; this helper logs
 * the status and a body prefix every time and honours Retry-After on 429.
 *
 * Dependency-free so vitest can import it under Node; `fetchImpl` and
 * `sleepImpl` are injectable so tests never touch the network or the clock.
 */

/** Resolves after `ms` milliseconds (negative values resolve immediately). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export interface RateLimitInfo {
  /** The URL with query string and fragment removed (keys travel there). */
  url: string
  /** 1-based attempt that received the 429. */
  attempt: number
  /** How long the helper waits before the next attempt. */
  retryAfterMs: number
  /** The 429 response; its body is still readable. */
  response: Response
}

export interface FetchWithRetryOptions {
  /**
   * Further attempts after the first one. Default 1, so a 429 is retried once
   * after honouring Retry-After. Retries also cover network errors, 408 and
   * 5xx (after `retryDelayMs`); other 4xx statuses return immediately because
   * they will not change on a retry.
   */
  retries?: number
  /** Called on each 429 that will be retried, before the wait. */
  onRateLimit?: (info: RateLimitInfo) => void
  /** Wait when a 429 carries no (or an unparseable) Retry-After. Default 60 s. */
  defaultRetryAfterMs?: number
  /** Upper bound on any Retry-After wait so one slow API cannot eat the wall clock. Default 60 s. */
  maxRetryAfterMs?: number
  /** Wait before retrying a network error, 408 or 5xx. Default 1 s. */
  retryDelayMs?: number
  /** Log label; defaults to the URL without its query string. */
  label?: string
  /** How many characters of a non-OK body to log. Default 200. */
  bodyPrefixLength?: number
  fetchImpl?: FetchLike
  sleepImpl?: (ms: number) => Promise<void>
}

/** Origin and path only, so a `?token=` never reaches the function log. */
export function describeUrl(url: string | URL): string {
  try {
    const u = new URL(String(url))
    return `${u.origin}${u.pathname}`
  } catch {
    return String(url).split(/[?#]/, 1)[0]
  }
}

/**
 * Milliseconds to wait for a Retry-After header: delta-seconds or an HTTP
 * date (RFC 9110 10.2.3). Falls back to `fallbackMs` when absent or invalid.
 */
export function parseRetryAfter(
  header: string | null,
  fallbackMs: number,
  now: number = Date.now(),
): number {
  if (header === null) return fallbackMs
  const value = header.trim()
  if (/^\d+$/.test(value)) return Number(value) * 1000
  // Only an HTTP date (which always carries a month name) may reach
  // Date.parse: V8 is lenient enough to turn '-5' into a year.
  if (!/[A-Za-z]/.test(value)) return fallbackMs
  const at = Date.parse(value)
  if (Number.isNaN(at)) return fallbackMs
  return Math.max(0, at - now)
}

/** Statuses worth a second attempt: timeout, rate limit, server error. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/**
 * Fetches `url`, logging every non-OK response (status + body prefix) and
 * retrying up to `retries` times. Returns the final Response whether or not
 * it is OK, with its body unread, so callers keep deciding what a 404 means.
 * Rethrows the last network error once retries are exhausted.
 */
export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    retries = 1,
    onRateLimit,
    defaultRetryAfterMs = 60_000,
    maxRetryAfterMs = 60_000,
    retryDelayMs = 1_000,
    bodyPrefixLength = 200,
    fetchImpl = fetch,
    sleepImpl = sleep,
  } = options
  const label = options.label ?? describeUrl(url)
  const maxAttempts = Math.max(1, Math.floor(retries) + 1)

  for (let attempt = 1; ; attempt++) {
    const last = attempt >= maxAttempts

    let response: Response
    try {
      response = await fetchImpl(url, init)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        `[http] ${label} attempt ${attempt}/${maxAttempts} failed: ${message}`,
      )
      if (last) throw error
      await sleepImpl(retryDelayMs)
      continue
    }

    if (response.ok) return response

    const prefix = await bodyPrefix(response, bodyPrefixLength)
    console.error(
      `[http] ${label} -> ${response.status} ${response.statusText}`.trimEnd() +
        (prefix ? `: ${prefix}` : ''),
    )

    if (last || !isRetryableStatus(response.status)) return response

    if (response.status === 429) {
      const retryAfterMs = Math.min(
        parseRetryAfter(
          response.headers.get('Retry-After'),
          defaultRetryAfterMs,
        ),
        maxRetryAfterMs,
      )
      onRateLimit?.({ url: label, attempt, retryAfterMs, response })
      console.warn(
        `[http] ${label} rate limited; retrying in ${retryAfterMs} ms`,
      )
      await sleepImpl(retryAfterMs)
    } else {
      await sleepImpl(retryDelayMs)
    }
  }
}

/** Reads a clone of the body so the caller's copy stays unconsumed. */
async function bodyPrefix(response: Response, length: number): Promise<string> {
  try {
    const text = await response.clone().text()
    return text.replace(/\s+/g, ' ').trim().slice(0, length)
  } catch {
    return ''
  }
}
