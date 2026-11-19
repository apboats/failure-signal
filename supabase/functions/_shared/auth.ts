/**
 * Caller authentication for edge functions.
 *
 * Every handler starts with the guard:
 *
 *   Deno.serve(async (req) => {
 *     const denied = requireServiceRole(req)
 *     if (denied) return denied
 *     ...
 *   })
 *
 * The guard is FAIL-OPEN until the `FN_AUTH_REQUIRED=true` secret is set, so
 * the order of "deploy functions" and "apply migration 00005 (cron starts
 * sending the Authorization header)" cannot stop the pipeline. The README
 * documents turning it on once 00005 is applied. When on, the caller must
 * present `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; the gateway's
 * verify_jwt alone is not enough because it also accepts the public anon key.
 *
 * Dependency-free so vitest can import it under Node.
 */
import { readEnv } from './env.ts'

/** A JSON Response with the right content type. `status` defaults to 200. */
export function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const h = new Headers(headers)
  h.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body ?? null), { status, headers: h })
}

/** Whether the guard is enforcing. Only the exact string 'true' turns it on. */
export function authRequired(): boolean {
  return readEnv('FN_AUTH_REQUIRED') === 'true'
}

/**
 * Returns null when the request may proceed, or a 401 JSON Response to return
 * as-is. Never logs the presented token.
 */
export function requireServiceRole(req: Request): Response | null {
  if (!authRequired()) return null

  const expected = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (expected === undefined) {
    console.error(
      '[auth] FN_AUTH_REQUIRED=true but SUPABASE_SERVICE_ROLE_KEY is not set; refusing every caller',
    )
    return unauthorized(req, 'service role key unavailable')
  }

  const header = req.headers.get('Authorization')
  if (header === null) return unauthorized(req, 'missing Authorization header')

  const presented = bearerToken(header)
  if (presented === null) {
    return unauthorized(req, 'malformed Authorization header')
  }
  if (!timingSafeEqual(presented, expected)) {
    return unauthorized(req, 'token mismatch')
  }
  return null
}

function unauthorized(req: Request, reason: string): Response {
  console.warn(`[auth] rejected ${req.method} ${describe(req.url)}: ${reason}`)
  return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
}

/** Path only: never echo a query string (it can carry keys) into the log. */
function describe(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/** Extracts the token from `Bearer <token>`; scheme is case-insensitive. */
function bearerToken(header: string): string | null {
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header)
  return match ? match[1] : null
}

/**
 * Compares two strings in time independent of where they first differ. The
 * length check short-circuits, which leaks only the key length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}
