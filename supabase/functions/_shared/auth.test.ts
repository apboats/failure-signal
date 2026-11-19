import { afterEach, describe, expect, it, vi } from 'vitest'
import { authRequired, json, requireServiceRole } from './auth.ts'

const KEY = 'service-role-key-for-tests'
const URL_ = 'https://example.supabase.co/functions/v1/fetch-news?token=secret'

/** Installs a fake `Deno.env` the way the edge runtime would populate it. */
function stubDenoEnv(vars: Record<string, string | undefined>) {
  vi.stubGlobal('Deno', { env: { get: (name: string) => vars[name] } })
}

function request(authorization?: string): Request {
  return new Request(URL_, {
    method: 'POST',
    headers:
      authorization === undefined ? {} : { Authorization: authorization },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('json', () => {
  it('serialises the body with a JSON content type and the given status', async () => {
    const res = json({ ok: true }, 201)
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('defaults to 200, keeps extra headers and encodes undefined as null', async () => {
    const res = json(undefined, undefined, { 'Cache-Control': 'no-store' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.text()).toBe('null')
  })
})

describe('requireServiceRole', () => {
  it('fails open when FN_AUTH_REQUIRED is unset, even with no header', () => {
    stubDenoEnv({ SUPABASE_SERVICE_ROLE_KEY: KEY })
    expect(authRequired()).toBe(false)
    expect(requireServiceRole(request())).toBeNull()
    expect(requireServiceRole(request('Bearer wrong'))).toBeNull()
  })

  it('fails open when FN_AUTH_REQUIRED is anything but the string true', () => {
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      stubDenoEnv({ FN_AUTH_REQUIRED: value, SUPABASE_SERVICE_ROLE_KEY: KEY })
      expect(requireServiceRole(request())).toBeNull()
    }
  })

  it('fails open when there is no Deno global at all (vitest under Node)', () => {
    expect(typeof Deno).toBe('undefined')
    expect(requireServiceRole(request())).toBeNull()
  })

  it('lets the service role key through when enforcing', () => {
    stubDenoEnv({ FN_AUTH_REQUIRED: 'true', SUPABASE_SERVICE_ROLE_KEY: KEY })
    expect(authRequired()).toBe(true)
    expect(requireServiceRole(request(`Bearer ${KEY}`))).toBeNull()
    expect(requireServiceRole(request(`bearer ${KEY}`))).toBeNull()
    expect(requireServiceRole(request(`  Bearer   ${KEY}  `))).toBeNull()
  })

  it('returns a 401 JSON response when the header is missing', async () => {
    stubDenoEnv({ FN_AUTH_REQUIRED: 'true', SUPABASE_SERVICE_ROLE_KEY: KEY })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const denied = requireServiceRole(request())
    expect(denied).toBeInstanceOf(Response)
    expect(denied?.status).toBe(401)
    expect(denied?.headers.get('Content-Type')).toBe('application/json')
    expect(denied?.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(await denied?.json()).toEqual({ error: 'unauthorized' })
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('POST /functions/v1/fetch-news')
    expect(line).toContain('missing Authorization header')
    expect(line).not.toContain('token=secret')
  })

  it('returns 401 on a wrong token, a malformed header or the anon key', () => {
    stubDenoEnv({ FN_AUTH_REQUIRED: 'true', SUPABASE_SERVICE_ROLE_KEY: KEY })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(requireServiceRole(request('Bearer not-the-key'))?.status).toBe(401)
    expect(requireServiceRole(request(`Bearer ${KEY}x`))?.status).toBe(401)
    expect(requireServiceRole(request(`Bearer ${KEY.slice(1)}`))?.status).toBe(
      401,
    )
    expect(requireServiceRole(request(KEY))?.status).toBe(401)
    expect(requireServiceRole(request('Basic abc'))?.status).toBe(401)
    expect(requireServiceRole(request('Bearer'))?.status).toBe(401)
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain(KEY)
    }
  })

  it('accepts FN_SERVICE_ROLE_KEY when it differs from the injected key', () => {
    stubDenoEnv({
      FN_AUTH_REQUIRED: 'true',
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      FN_SERVICE_ROLE_KEY: 'explicit-copy-of-the-vault-key',
    })
    expect(
      requireServiceRole(request('Bearer explicit-copy-of-the-vault-key')),
    ).toBeNull()
    expect(requireServiceRole(request(`Bearer ${KEY}`))).toBeNull()
    expect(requireServiceRole(request('Bearer neither'))?.status).toBe(401)
  })

  it('refuses every caller when enforcing but the key is unavailable', () => {
    stubDenoEnv({ FN_AUTH_REQUIRED: 'true' })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(requireServiceRole(request('Bearer undefined'))?.status).toBe(401)
    expect(requireServiceRole(request('Bearer '))?.status).toBe(401)
    // The misconfiguration is logged on every refused request so it is
    // visible in the function log no matter which cron job hits it first.
    expect(error).toHaveBeenCalledTimes(2)
    expect(String(error.mock.calls[0][0])).toContain(
      'neither FN_SERVICE_ROLE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set',
    )
  })
})
