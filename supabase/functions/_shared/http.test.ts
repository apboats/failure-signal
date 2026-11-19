import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeUrl,
  fetchWithRetry,
  isRetryableStatus,
  parseRetryAfter,
  sleep,
  type FetchLike,
  type RateLimitInfo,
} from './http.ts'

const URL_ = 'https://finnhub.io/api/v1/quote?symbol=JPM&token=secret'

function res(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers })
}

/** A fetch that answers from a queue; an Error entry is thrown instead. */
function fakeFetch(...queue: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const impl: FetchLike = (url, init) => {
    calls.push({ url: String(url), init })
    const next = queue.shift()
    if (next === undefined) {
      return Promise.reject(new Error('fakeFetch: queue exhausted'))
    }
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return { impl, calls }
}

/** A sleep that records the requested waits and resolves immediately. */
function fakeSleep() {
  const waits: number[] = []
  const impl = (ms: number) => {
    waits.push(ms)
    return Promise.resolve()
  }
  return { impl, waits }
}

let errorLog: ReturnType<typeof vi.spyOn>
let warnLog: ReturnType<typeof vi.spyOn>

function quiet() {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {})
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sleep', () => {
  it('resolves only once the delay has elapsed', async () => {
    vi.useFakeTimers()
    try {
      let done = false
      const p = sleep(50).then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(49)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await p
      expect(done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a negative delay as zero', async () => {
    await expect(sleep(-5)).resolves.toBeUndefined()
  })
})

describe('describeUrl', () => {
  it('drops the query string and fragment', () => {
    expect(describeUrl(URL_)).toBe('https://finnhub.io/api/v1/quote')
    expect(describeUrl(new URL(URL_))).toBe('https://finnhub.io/api/v1/quote')
    expect(describeUrl('not a url?x=1#y')).toBe('not a url')
  })
})

describe('parseRetryAfter', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('2', 999)).toBe(2000)
    expect(parseRetryAfter(' 0 ', 999)).toBe(0)
  })

  it('reads an HTTP date relative to now and floors at zero', () => {
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:30 GMT', 999, now)).toBe(
      30_000,
    )
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:27:00 GMT', 999, now)).toBe(0)
  })

  it('falls back when absent or unparseable', () => {
    expect(parseRetryAfter(null, 999)).toBe(999)
    expect(parseRetryAfter('soon', 999)).toBe(999)
    expect(parseRetryAfter('-5', 999)).toBe(999)
  })
})

describe('isRetryableStatus', () => {
  it('covers timeout, rate limit and server errors only', () => {
    expect([408, 429, 500, 502, 503].every(isRetryableStatus)).toBe(true)
    expect([200, 400, 401, 403, 404, 422].some(isRetryableStatus)).toBe(false)
  })
})

describe('fetchWithRetry', () => {
  it('returns an OK response untouched without logging or sleeping', async () => {
    quiet()
    const fetch = fakeFetch(res(200, '{"c":1}'))
    const sleeper = fakeSleep()
    const out = await fetchWithRetry(
      URL_,
      { method: 'GET' },
      {
        fetchImpl: fetch.impl,
        sleepImpl: sleeper.impl,
      },
    )
    expect(out.status).toBe(200)
    expect(await out.json()).toEqual({ c: 1 })
    expect(fetch.calls).toHaveLength(1)
    expect(fetch.calls[0].init?.method).toBe('GET')
    expect(sleeper.waits).toEqual([])
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('honours Retry-After on 429 once by default and reports it', async () => {
    quiet()
    const fetch = fakeFetch(
      res(429, 'API limit reached', { 'Retry-After': '2' }),
      res(200, 'ok'),
    )
    const sleeper = fakeSleep()
    const rateLimits: RateLimitInfo[] = []
    const out = await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
      onRateLimit: (info) => rateLimits.push(info),
    })
    expect(out.status).toBe(200)
    expect(fetch.calls).toHaveLength(2)
    expect(sleeper.waits).toEqual([2000])
    expect(rateLimits).toHaveLength(1)
    expect(rateLimits[0]).toMatchObject({
      url: 'https://finnhub.io/api/v1/quote',
      attempt: 1,
      retryAfterMs: 2000,
    })
    expect(await rateLimits[0].response.text()).toBe('API limit reached')
    const line = String(errorLog.mock.calls[0][0])
    expect(line).toContain('429')
    expect(line).toContain('API limit reached')
    expect(line).not.toContain('token=secret')
  })

  it('uses the default wait when 429 has no Retry-After, capped by maxRetryAfterMs', async () => {
    quiet()
    const fetch = fakeFetch(res(429), res(200))
    const sleeper = fakeSleep()
    await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
    })
    expect(sleeper.waits).toEqual([60_000])

    const fetch2 = fakeFetch(res(429, '', { 'Retry-After': '120' }), res(200))
    const sleeper2 = fakeSleep()
    await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch2.impl,
      sleepImpl: sleeper2.impl,
      maxRetryAfterMs: 5_000,
    })
    expect(sleeper2.waits).toEqual([5_000])
  })

  it('gives up after the retry budget and returns the last 429 with a readable body', async () => {
    quiet()
    const fetch = fakeFetch(
      res(429, 'first', { 'Retry-After': '1' }),
      res(429, 'second', { 'Retry-After': '1' }),
      res(200, 'never reached'),
    )
    const sleeper = fakeSleep()
    const onRateLimit = vi.fn()
    const out = await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
      onRateLimit,
    })
    expect(out.status).toBe(429)
    expect(await out.text()).toBe('second')
    expect(fetch.calls).toHaveLength(2)
    expect(sleeper.waits).toEqual([1000])
    expect(onRateLimit).toHaveBeenCalledTimes(1)
    expect(errorLog).toHaveBeenCalledTimes(2)
    expect(warnLog).toHaveBeenCalledTimes(1)
  })

  it('does not retry other 4xx statuses but still logs them', async () => {
    quiet()
    const fetch = fakeFetch(res(401, '{"error":"Invalid API key"}'), res(200))
    const sleeper = fakeSleep()
    const out = await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
      label: 'Finnhub JPM',
    })
    expect(out.status).toBe(401)
    expect(await out.json()).toEqual({ error: 'Invalid API key' })
    expect(fetch.calls).toHaveLength(1)
    expect(sleeper.waits).toEqual([])
    expect(errorLog).toHaveBeenCalledTimes(1)
    const line = String(errorLog.mock.calls[0][0])
    expect(line).toContain('Finnhub JPM')
    expect(line).toContain('401')
    expect(line).toContain('Invalid API key')
  })

  it('retries a 5xx after retryDelayMs and truncates the logged body', async () => {
    quiet()
    const fetch = fakeFetch(res(503, 'x'.repeat(500)), res(200, 'ok'))
    const sleeper = fakeSleep()
    const out = await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
      retryDelayMs: 250,
      bodyPrefixLength: 20,
    })
    expect(out.status).toBe(200)
    expect(sleeper.waits).toEqual([250])
    const line = String(errorLog.mock.calls[0][0])
    expect(line).toContain('503')
    expect(line).toContain('x'.repeat(20))
    expect(line).not.toContain('x'.repeat(21))
  })

  it('retries a network error and rethrows the last one when exhausted', async () => {
    quiet()
    const fetch = fakeFetch(new Error('connection reset'), res(200, 'ok'))
    const sleeper = fakeSleep()
    const out = await fetchWithRetry(URL_, undefined, {
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
    })
    expect(out.status).toBe(200)
    expect(sleeper.waits).toEqual([1000])

    const fetch2 = fakeFetch(new Error('first'), new Error('second'))
    await expect(
      fetchWithRetry(URL_, undefined, {
        fetchImpl: fetch2.impl,
        sleepImpl: fakeSleep().impl,
      }),
    ).rejects.toThrow('second')
    expect(fetch2.calls).toHaveLength(2)
  })

  it('retries: 0 makes a single attempt', async () => {
    quiet()
    const fetch = fakeFetch(res(500, 'boom'), res(200))
    const sleeper = fakeSleep()
    const out = await fetchWithRetry(URL_, undefined, {
      retries: 0,
      fetchImpl: fetch.impl,
      sleepImpl: sleeper.impl,
    })
    expect(out.status).toBe(500)
    expect(fetch.calls).toHaveLength(1)
    expect(sleeper.waits).toEqual([])
  })
})
