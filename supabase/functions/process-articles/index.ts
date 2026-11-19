/**
 * process-articles: drains news_articles where analyzed_at is null (15 per
 * run, every 5 minutes = 180/hour) through Claude and writes relevance,
 * sentiment, the institution link and any risk_signals.
 *
 * Per article:
 *   1. structured-output analysis (schema below; model and request shape in
 *      _shared/anthropic.ts)
 *   2. institution resolution through the in-memory matcher: the model's
 *      ticker/name wins over the query-time guess fetch-news stored, so an
 *      article that a "Citizens" search attached to the wrong bank is
 *      re-linked (or unlinked). New institutions are created only when the
 *      article is relevant (score >= 0.3) and the sector is not insurance.
 *   3. risk_signals insert (only when relevant and linked), then the article
 *      update that sets analyzed_at. The insert comes first and throws on
 *      error so a lost signal never leaves the article marked analyzed.
 *
 * Failure handling:
 *   - request-independent (retired model, bad key, quota, outage, DB
 *     connectivity): the article is left untouched, the loop stops and the
 *     run returns 500 (429 when rate limited). pg_net ignores the status,
 *     so the counts are also logged.
 *   - article-specific (schema/JSON failure, refusal, max_tokens,
 *     BadRequestError, constraint violation): analyzed_at is set with a
 *     '[Analysis failed: ...]' summary so the queue keeps moving;
 *     supabase/ops/03 re-queues those by hand.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { json, requireServiceRole } from '../_shared/auth.ts'
import {
  abortStatus,
  analyzeJson,
  describeError,
  getClient,
  isRequestIndependentError,
  MODEL,
} from '../_shared/anthropic.ts'
import {
  findOrCreateInstitution,
  loadInstitutionIndex,
  matchInstitution,
  type InstitutionIndex,
  type InstitutionRow,
} from '../_shared/institutions.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BATCH_SIZE = 15

/** Below this relevance no signals are written and no institution is created. */
const MIN_RELEVANCE = 0.3

/** Article bodies from GNews are a few hundred characters; cap the odd long one. */
const MAX_CONTENT_CHARS = 12_000

/** The eleven categories the news prompt may emit (peer_contagion and social_panic are computed elsewhere). */
const SIGNAL_CATEGORIES = [
  'stock_drop',
  'cds_spike',
  'liquidity_warning',
  'client_withdrawal',
  'counterparty_action',
  'regulatory_signal',
  'credit_downgrade',
  'executive_departure',
  'news_sentiment',
  'insider_selling',
  'lawmaker_selling',
] as const

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

const SECTORS = [
  'banking',
  'investment_bank',
  'fintech',
  'asset_management',
] as const

const SENTIMENT_LABELS = [
  'very_negative',
  'negative',
  'neutral',
  'positive',
  'very_positive',
] as const

const SignalSchema = z.object({
  category: z.enum(SIGNAL_CATEGORIES),
  severity: z.enum(SEVERITIES),
  title: z.string().describe('Short description of the signal'),
  description: z.string().describe('Detailed context from the article'),
})

const AnalysisSchema = z.object({
  institution_name: z
    .string()
    .nullable()
    .describe(
      "Common short name of the primary institution without legal suffix (e.g. 'Banco Santander', not 'Banco Santander, S.A.'; 'Goldman Sachs', not 'The Goldman Sachs Group, Inc.'), or null when the filtering rules apply",
    ),
  institution_ticker: z
    .string()
    .nullable()
    .describe("US-listed stock ticker if known (e.g. 'GS'), else null"),
  institution_sector: z.enum(SECTORS).nullable(),
  sentiment_score: z
    .number()
    .describe('-1.0 (very negative) to 1.0 (very positive)'),
  sentiment_label: z.enum(SENTIMENT_LABELS),
  relevance_score: z
    .number()
    .describe('0.0 to 1.0: relevance to institutional failure risk'),
  summary: z.string().describe('One paragraph focusing on risk implications'),
  signals: z.array(SignalSchema),
})

type Analysis = z.infer<typeof AnalysisSchema>

const SYSTEM_PROMPT = `You are a financial risk analyst specializing in early detection of institutional failure.
Analyze news articles for signs of financial distress, using the Bear Stearns and Silicon Valley Bank collapses as reference patterns.

For each article, fill in the provided schema:
- institution_name: the common short name of the primary financial institution the article is about, without legal suffix (e.g. "Banco Santander", not "Banco Santander, S.A."; "Goldman Sachs", not "The Goldman Sachs Group, Inc.")
- institution_ticker: the US-listed stock ticker if known (e.g. "GS"), or null
- institution_sector: one of "banking", "investment_bank", "fintech", "asset_management"
- sentiment_score: number from -1.0 (very negative) to 1.0 (very positive)
- sentiment_label: one of "very_negative", "negative", "neutral", "positive", "very_positive"
- relevance_score: 0.0 to 1.0 indicating relevance to institutional failure risk
- summary: one paragraph summary focusing on risk implications
- signals: array of detected risk signals, each with:
  - category: one of "stock_drop", "cds_spike", "liquidity_warning", "client_withdrawal", "counterparty_action", "regulatory_signal", "credit_downgrade", "executive_departure", "news_sentiment", "insider_selling", "lawmaker_selling"
  - severity: "low", "medium", "high", or "critical"
  - title: short description of the signal
  - description: detailed context

IMPORTANT FILTERING RULES — set institution_name to null if ANY of these apply:
- Not a financial institution (e.g. airlines, retailers, tech companies, energy companies)
- Not a bank or banking-adjacent (excludes pure payment processors like Visa/PayPal, insurance companies)
- Does NOT have significant US operations or US-listed stock (we only track US-focused banks)
- Foreign-only banks based in India, China, Indonesia, Thailand, Brazil, Korea, Japan, etc.
  with no major US presence
- Central banks (Federal Reserve, ECB, Bank of England, etc.)
- Government-owned or state-controlled banks
- Cooperatives that are not publicly traded
- Crypto exchanges or DeFi platforms (except Coinbase which is US-listed and tracked)
- Already-defunct institutions (FTX, Credit Suisse, First Republic, SVB)
- Small community banks under $1B in assets

ONLY include the institution if:
- It is a publicly traded US bank, US investment bank, or US financial services company
- OR a foreign bank with substantial US operations (HSBC, Deutsche Bank, UBS, Barclays, TD Bank)
- It has a US-listed stock ticker (NYSE or NASDAQ)

When the article was found by a search for a specific institution, decide independently whether the article is actually about that institution; if it is about a different one, name that one instead.

If unsure, default to null. Better to miss an institution than to add junk.
Only report signals the article itself supports; an empty signals array is the normal answer for routine coverage.`

interface PendingArticle {
  id: string
  institution_id: string | null
  title: string
  source: string | null
  url: string | null
  published_at: string | null
  raw_content: string | null
}

interface RunSummary {
  processed: number
  failed: number
  aborted: boolean
  pending: number
  model: string
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    // Fails with a readable message when ANTHROPIC_API_KEY is unset, before
    // any article is touched.
    getClient()

    const { data, error: fetchError } = await supabase
      .from('news_articles')
      .select(
        'id, institution_id, title, source, url, published_at, raw_content',
      )
      .is('analyzed_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)
    if (fetchError) throw fetchError

    const articles = (data ?? []) as PendingArticle[]
    if (articles.length === 0) {
      return json({
        success: true,
        processed: 0,
        failed: 0,
        aborted: false,
        pending: 0,
        model: MODEL,
      })
    }

    const { count } = await supabase
      .from('news_articles')
      .select('*', { count: 'exact', head: true })
      .is('analyzed_at', null)

    const index = await loadInstitutionIndex(supabase)

    let processed = 0
    let failed = 0
    let abort: { status: number; error: string } | null = null

    for (const article of articles) {
      try {
        await processArticle(article, index)
        processed++
      } catch (error) {
        const message = describeError(error)
        if (isRequestIndependentError(error) || isTransientDbError(error)) {
          console.error(
            `[process-articles] aborting run at article ${article.id} (left unanalyzed): ${message}`,
          )
          abort = { status: abortStatus(error), error: message }
          break
        }
        failed++
        console.error(
          `[process-articles] article ${article.id} failed: ${message}`,
        )
        await markFailed(article.id, message)
      }
    }

    const summary: RunSummary = {
      processed,
      failed,
      aborted: abort !== null,
      pending: Math.max(0, (count ?? 0) - processed - failed),
      model: MODEL,
    }
    console.log(`[process-articles] ${JSON.stringify(summary)}`)

    if (abort) {
      return json(
        { success: false, ...summary, error: abort.error },
        abort.status,
      )
    }
    return json({ success: true, ...summary })
  } catch (error) {
    const message = describeError(error)
    console.error(`[process-articles] run failed: ${message}`)
    return json({ error: message }, 500)
  }
})

async function processArticle(
  article: PendingArticle,
  index: InstitutionIndex,
): Promise<void> {
  const hint = article.institution_id
    ? index.byId.get(article.institution_id)
    : undefined

  const analysis = await analyzeJson(
    AnalysisSchema,
    SYSTEM_PROMPT,
    buildUserMessage(article, hint),
  )

  const relevance = round(clamp(analysis.relevance_score, 0, 1), 2)
  const sentiment = round(clamp(analysis.sentiment_score, -1, 1), 3)
  const relevant = relevance >= MIN_RELEVANCE

  const institutionId = await resolveInstitution(
    article,
    analysis,
    relevant,
    index,
  )
  if (institutionId !== (article.institution_id ?? null)) {
    console.log(
      `[process-articles] article ${article.id}: institution ${article.institution_id ?? 'none'} -> ${institutionId ?? 'none'} (${analysis.institution_name ?? 'no institution'})`,
    )
  }

  if (relevant && institutionId && analysis.signals.length > 0) {
    const signals = analysis.signals.map((s) => ({
      institution_id: institutionId,
      news_article_id: article.id,
      category: s.category,
      severity: s.severity,
      title: s.title,
      description: s.description,
      signal_date: article.published_at || new Date().toISOString(),
      source: article.source,
    }))
    const { error: signalError } = await supabase
      .from('risk_signals')
      .insert(signals)
    if (signalError) throw signalError
  }

  const { error: updateError } = await supabase
    .from('news_articles')
    .update({
      institution_id: institutionId,
      sentiment_score: sentiment,
      sentiment_label: analysis.sentiment_label,
      relevance_score: relevance,
      summary: analysis.summary,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', article.id)
  if (updateError) throw updateError
}

/**
 * The institution this article belongs to, by the model's answer:
 *   - a known institution (by ticker, then name): that one, even when
 *     fetch-news had attached the article to a different bank
 *   - an unknown institution on a relevant article: created (null for insurers)
 *   - an unknown institution on an irrelevant article, or no institution at
 *     all: null, so a query-time guess never survives the model's verdict
 */
async function resolveInstitution(
  article: PendingArticle,
  analysis: Analysis,
  relevant: boolean,
  index: InstitutionIndex,
): Promise<string | null> {
  const name = analysis.institution_name?.trim() ?? ''
  if (name.length === 0) return null

  const matched = matchInstitution(index, {
    name,
    ticker: analysis.institution_ticker,
  })
  if (matched) return matched.id
  if (!relevant) {
    console.log(
      `[process-articles] article ${article.id}: ${name} is unknown and relevance ${analysis.relevance_score} is below ${MIN_RELEVANCE}; not creating`,
    )
    return null
  }
  return findOrCreateInstitution(supabase, index, {
    name,
    ticker: analysis.institution_ticker,
    sector: analysis.institution_sector,
  })
}

function buildUserMessage(
  article: PendingArticle,
  hint: InstitutionRow | undefined,
): string {
  const lines: string[] = []
  if (hint) {
    lines.push(
      `This article was found by a news search for ${hint.name}${hint.ticker ? ` (${hint.ticker})` : ''}. Confirm whether it is actually about that institution.`,
      '',
    )
  }
  lines.push(
    `Title: ${article.title}`,
    `Source: ${article.source ?? 'unknown'}`,
    `Date: ${article.published_at ?? 'unknown'}`,
    '',
    'Content:',
    (article.raw_content || article.title).slice(0, MAX_CONTENT_CHARS),
  )
  return lines.join('\n')
}

async function markFailed(articleId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('news_articles')
    .update({
      analyzed_at: new Date().toISOString(),
      summary: `[Analysis failed: ${message.slice(0, 200)}]`,
    })
    .eq('id', articleId)
  if (error) {
    console.error(
      `[process-articles] could not mark article ${articleId} failed: ${error.message}`,
    )
  }
}

/**
 * A Postgres/PostgREST error that reflects the connection rather than this
 * article: a failed fetch (supabase-js reports it with an empty code), or
 * SQLSTATE classes 08 (connection), 40 (transaction rollback), 53
 * (resources), 57 (operator intervention), 58 (system) and XX (internal).
 * PGRST* codes and data/integrity errors (22*, 23*) are deterministic for
 * the row and are treated as article-specific.
 */
function isTransientDbError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  if (error instanceof Error) return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (code.startsWith('PGRST')) return false
  if (!/^[0-9A-Z]{5}$/.test(code)) return true
  return ['08', '40', '53', '57', '58', 'XX'].some((prefix) =>
    code.startsWith(prefix),
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
