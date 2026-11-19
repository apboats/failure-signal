/**
 * Environment access for edge functions.
 *
 * Dependency-free on purpose: vitest imports this module under Node, where the
 * `Deno` global does not exist, so every read goes through `readEnv`, which is
 * guarded on `typeof Deno`.
 *
 * Call `requireEnv` INSIDE the request handler, never at module top level. A
 * throw at import time crashes the isolate at boot and the function log shows
 * only a generic boot failure; a throw inside the handler surfaces as a
 * readable 500 with the variable name in the body.
 *
 * Secrets are set by the owner with `supabase secrets set NAME=value`;
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */

interface EnvReader {
  get(name: string): string | undefined
}

/** The runtime's environment, or undefined outside Deno (vitest under Node). */
function runtimeEnv(): EnvReader | undefined {
  if (typeof Deno === 'undefined') return undefined
  const env: Partial<EnvReader> | undefined = Deno.env
  return typeof env?.get === 'function' ? (env as EnvReader) : undefined
}

/**
 * Reads one variable. Empty and whitespace-only values count as unset: an
 * empty API key is as useless as a missing one and should not pass a guard.
 */
export function readEnv(name: string): string | undefined {
  let raw: string | undefined
  try {
    raw = runtimeEnv()?.get(name)
  } catch {
    // Deno throws when env access is not permitted; treat as unset.
    return undefined
  }
  if (raw === undefined) return undefined
  const value = raw.trim()
  return value === '' ? undefined : value
}

/**
 * Returns the variable or throws a readable Error naming it and how to set it.
 * Use inside handlers only (see the module header).
 */
export function requireEnv(name: string): string {
  const value = readEnv(name)
  if (value === undefined) {
    throw new Error(
      `${name} is not set. Set it with \`supabase secrets set ${name}=...\` and redeploy the function.`,
    )
  }
  return value
}

/** Names already warned about in this isolate, so logs carry one line per secret. */
const warned = new Set<string>()

/**
 * Returns the variable, or undefined after logging `warnMessage` once per
 * isolate. For intentionally optional secrets (secondary news source, price
 * enrichment) whose absence should be visible in the function log without
 * changing behaviour.
 */
export function optionalEnv(
  name: string,
  warnMessage: string,
): string | undefined {
  const value = readEnv(name)
  if (value === undefined && !warned.has(name)) {
    warned.add(name)
    console.warn(`${name} is not set: ${warnMessage}`)
  }
  return value
}
