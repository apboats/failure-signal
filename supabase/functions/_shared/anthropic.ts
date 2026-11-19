/**
 * Anthropic client and structured-output helper for the two LLM functions
 * (process-articles, fetch-sec-filings).
 *
 * MODEL
 *   `ANTHROPIC_MODEL` secret, default 'claude-sonnet-5-5'. Both functions are
 *   bulk extraction jobs (one short JSON object per article or filing), which
 *   is what the Sonnet tier is priced for. The owner may set
 *   `supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5` for higher-quality
 *   extraction at roughly twice the token price. Never a date-suffixed id:
 *   the dated Sonnet 4 snapshot the functions used to pin was retired on
 *   2026-06-15 and every call returned 404 for three weeks before anyone
 *   noticed (F004).
 *
 * SDK
 *   npm:@anthropic-ai/sdk@1.10.0. The 0.39 pin predates `output_config` and
 *   `messages.parse`. Zod 4 is the SDK's optional peer dependency and the
 *   functions import it as `npm:zod@4`.
 *
 * REQUEST SHAPE (`analyzeJson`)
 *   `messages.parse` with `output_config.format = zodOutputFormat(schema)` and
 *   `effort: 'low'`. No `thinking` (omitting it is the correct way; `{type:
 *   'disabled'}` is a 400 on this model), no temperature/top_p/top_k, no
 *   `tool_choice`. The result is read from `parsed_output` only: thinking
 *   blocks can precede the text block, so the first content block is never
 *   assumed to be the answer.
 *   `stop_reason` is checked before the output is trusted.
 *
 * ERROR SPLIT
 *   `isRequestIndependentError` names the failures that would hit every item
 *   in a run (retired model, bad key, quota, outage). Callers abort the run on
 *   those and leave the item untouched so it is retried next run. Everything
 *   else (schema/JSON failures, refusals, `max_tokens`, BadRequestError) is
 *   specific to the item and is recorded against it.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.10.0/helpers/zod'
import type { z } from 'npm:zod@4'
import { readEnv, requireEnv } from './env.ts'

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

/** The model every call uses; see the module header for the override. */
export const MODEL: string = readEnv('ANTHROPIC_MODEL') ?? DEFAULT_MODEL

/** Default output cap; a short JSON object never approaches it. */
export const DEFAULT_MAX_TOKENS = 4096

let cached: Anthropic | undefined

/**
 * The shared client, constructed on first use. Call it once at the top of a
 * handler: a missing ANTHROPIC_API_KEY then surfaces as a readable 500 before
 * any item is touched, instead of a boot failure or a per-item error.
 */
export function getClient(): Anthropic {
  cached ??= new Anthropic({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    maxRetries: 2,
    timeout: 60_000,
  })
  return cached
}

export type AnalysisFailureReason =
  'refusal' | 'max_tokens' | 'context_window' | 'unparsed'

/**
 * The model answered but the answer is unusable for this input. Retrying the
 * same input would produce the same outcome, so callers record it against
 * the item and move on.
 */
export class NonRetryableAnalysisError extends Error {
  readonly reason: AnalysisFailureReason

  constructor(reason: AnalysisFailureReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason)
    this.name = 'NonRetryableAnalysisError'
    this.reason = reason
  }
}

export interface AnalyzeOptions {
  maxTokens?: number
}

/**
 * One structured-output call. Resolves to the schema's output type or throws:
 * a NonRetryableAnalysisError for refusal / max_tokens / unparseable output,
 * or the SDK's APIError subclass for transport and API failures.
 */
export async function analyzeJson<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  options: AnalyzeOptions = {},
): Promise<T> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS

  let res
  try {
    res = await getClient().messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(schema), effort: 'low' },
    })
  } catch (error) {
    // The SDK validates the text against the schema inside parse() and
    // throws a plain AnthropicError (not an APIError) when it is not JSON or
    // fails the schema, e.g. the prose a refusal produces. Specific to this
    // input, so it is reported as unparsed rather than as a run failure.
    if (
      error instanceof Anthropic.AnthropicError &&
      !(error instanceof Anthropic.APIError)
    ) {
      throw new NonRetryableAnalysisError('unparsed', error.message)
    }
    throw error
  }

  if (res.stop_reason === 'refusal') {
    throw new NonRetryableAnalysisError(
      'refusal',
      'the model declined to analyze this input',
    )
  }
  if (res.stop_reason === 'max_tokens') {
    throw new NonRetryableAnalysisError(
      'max_tokens',
      `output cut off at ${maxTokens} tokens`,
    )
  }
  if (res.stop_reason === 'model_context_window_exceeded') {
    throw new NonRetryableAnalysisError(
      'context_window',
      'input too long for the model context window',
    )
  }
  if (res.parsed_output === null || res.parsed_output === undefined) {
    throw new NonRetryableAnalysisError(
      'unparsed',
      'no JSON text block in the response',
    )
  }
  return res.parsed_output
}

/**
 * True for failures that do not depend on the input: a retired model id
 * (404), a bad or revoked key (401/403), an unpaid account (402), rate
 * limiting (429), a server error or overload (5xx) and connection failures
 * (including timeouts). A run that sees one should stop and leave its items
 * for the next run.
 */
export function isRequestIndependentError(error: unknown): boolean {
  return (
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.PaymentRequiredError ||
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  )
}

/** HTTP status for a run aborted by `error`: 429 when rate limited, else 500. */
export function abortStatus(error: unknown): number {
  return error instanceof Anthropic.RateLimitError ? 429 : 500
}

/** One line for logs and `[Analysis failed: ...]` markers. Never the request body. */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const status = error.status === undefined ? '' : ` ${error.status}`
    return `${error.name}${status}: ${error.message}`
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { code, message } = error as { code?: unknown; message: unknown }
    return code ? `${String(code)}: ${String(message)}` : String(message)
  }
  return String(error)
}
