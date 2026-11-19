import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalEnv, readEnv, requireEnv } from './env.ts'

function stubDenoEnv(vars: Record<string, string | undefined>) {
  vi.stubGlobal('Deno', { env: { get: (name: string) => vars[name] } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readEnv', () => {
  it('returns the trimmed value and treats blank values as unset', () => {
    stubDenoEnv({ A: '  abc ', B: '', C: '   ' })
    expect(readEnv('A')).toBe('abc')
    expect(readEnv('B')).toBeUndefined()
    expect(readEnv('C')).toBeUndefined()
    expect(readEnv('D')).toBeUndefined()
  })

  it('returns undefined when Deno is absent or env access throws', () => {
    expect(readEnv('A')).toBeUndefined()
    vi.stubGlobal('Deno', {
      env: {
        get: () => {
          throw new Error('Requires env access')
        },
      },
    })
    expect(readEnv('A')).toBeUndefined()
  })
})

describe('requireEnv', () => {
  it('returns the value when set', () => {
    stubDenoEnv({ FINNHUB_KEY: 'k' })
    expect(requireEnv('FINNHUB_KEY')).toBe('k')
  })

  it('throws a readable error naming the variable and how to set it', () => {
    stubDenoEnv({ FINNHUB_KEY: '' })
    expect(() => requireEnv('FINNHUB_KEY')).toThrowError(
      /FINNHUB_KEY is not set.*supabase secrets set FINNHUB_KEY=/,
    )
    vi.unstubAllGlobals()
    expect(() => requireEnv('GNEWS_API_KEY')).toThrowError(/GNEWS_API_KEY/)
  })
})

describe('optionalEnv', () => {
  it('returns the value without warning when set', () => {
    stubDenoEnv({ NEWS_API_KEY: 'n' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(optionalEnv('NEWS_API_KEY', 'secondary news source disabled')).toBe(
      'n',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once per isolate per variable when missing', () => {
    stubDenoEnv({})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(optionalEnv('OPT_ONE', 'first message')).toBeUndefined()
    expect(optionalEnv('OPT_ONE', 'first message')).toBeUndefined()
    expect(optionalEnv('OPT_ONE', 'first message')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toBe(
      'OPT_ONE is not set: first message',
    )

    expect(optionalEnv('OPT_TWO', 'second message')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[1][0])).toBe(
      'OPT_TWO is not set: second message',
    )
  })
})
