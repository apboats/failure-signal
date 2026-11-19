/**
 * fetch-news: pulls recent articles from GNews (primary) and, for the broad
 * distress queries only, NewsAPI (optional supplement), and inserts them
 * into news_articles. Analysis happens later in process-articles.
 *
 * GNews quota arithmetic (1,000 requests/day plan, F046):
 *   institution loop   61 active institutions, only at UTC hours divisible
 *                      by 3 (00, 03, ..., 21)         61 x 8  = 488 / day
 *   broad queries      8 per run, every hourly run     8 x 24 = 192 / day
 *                                                      total    680 / day
 * The previous every-hour institution loop was 69 x 24 = 1,656/day and hit
 * 403 by early afternoon, so the last ~9 hours of each day fetched nothing.
 * The first 403 now ends the run with a 429 instead of burning the rest of
 * the calls.
 *
 * Queries: the institution name as an exact phrase, plus the ticker only
 * when it is at least four letters (a short ticker like "C" or "KEY" matches
 * everything). `from=` is 72 h ago so a newly added quiet institution does
 * not seed years-old articles; `country=us` applies to the broad queries
 * only, because the tracked foreign banks need worldwide coverage.
 *
 * Writes: one upsert per query with `onConflict: 'url', ignoreDuplicates`,
 * which needs the unique index that supabase/ops/06_dedupe_news_urls.sql
 * creates (F074). Until the owner applies it the upsert fails with 42P10 and
 * the function falls back to select-then-insert for the rest of the isolate.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { optionalEnv, readEnv } from '../_shared/env.ts'
import { fetchWithRetry } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const GNEWS_API_KEY = readEnv('GNEWS_API_KEY')
const NEWS_API_KEY = optionalEnv(
  'NEWS_API_KEY',
  'the NewsAPI supplement for the broad distress queries is off; GNews alone is used',
)

/** Institution loop cadence in hours; see the quota arithmetic above. */
const INSTITUTION_LOOP_EVERY_HOURS = 3
const LOOKBACK_HOURS = 72
const MIN_TICKER_LENGTH_FOR_QUERY = 4

interface NormalizedArticle {
  title: string
  source: string
  url: string
  published_at: string
  raw_content: string
}

interface GNewsResult {
  articles: NormalizedArticle[]
  /** HTTP status of the GNews response; 0 when no key is configured. */
  status: number
}

interface SaveResult {
  fetched: number
  new_articles: number
  error?: string
}

type QueryResult =
  ({ query: string } & SaveResult) | { query: string; error: string }

const BROAD_QUERIES = [
  '"bank failure"',
  '"liquidity crisis" bank',
  '"credit downgrade" bank',
  'bank bailout',
  '"bank run"',
  'bank "stock plunge"',
  'bank regulatory action',
  '"fund withdrawal" bank',
]

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  if (!GNEWS_API_KEY && !NEWS_API_KEY) {
    return json(
      {
        error:
          'Neither GNEWS_API_KEY nor NEWS_API_KEY is set. Set at least GNEWS_API_KEY with `supabase secrets set` and redeploy.',
      },
      500,
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const institutionId: string | null =
      typeof body?.institution_id === 'string' ? body.institution_id : null

    const results: QueryResult[] = []
    let quotaExhausted = false

    if (institutionId) {
      // Single institution, both sources: used for manual re-fetches.
      const { data: inst, error } = await supabase
        .from('institutions')
        .select('id, name, ticker')
        .eq('id', institutionId)
        .limit(1)
      if (error) throw error
      const target = inst?.[0]
      if (!target) return json({ error: 'institution not found' }, 404)

      const query = institutionQuery(target.name, target.ticker)
      const { articles, status } = await fetchGNews(query)
      if (status === 403) quotaExhausted = true
      if (NEWS_API_KEY) {
        try {
          articles.push(...(await fetchNewsApi(query)))
        } catch (e) {
          console.error(
            `[fetch-news] NewsAPI error for ${target.name}: ${String(e)}`,
          )
        }
      }
      const saved = await saveArticles(articles, target.id)
      results.push({ query: target.name, ...saved })
    } else {
      const hour = new Date().getUTCHours()
      const runInstitutions = hour % INSTITUTION_LOOP_EVERY_HOURS === 0

      if (runInstitutions && GNEWS_API_KEY) {
        const { data: institutions, error } = await supabase
          .from('institutions')
          .select('id, name, ticker')
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(1000)
        if (error) throw error

        for (const inst of institutions ?? []) {
          try {
            const { articles, status } = await fetchGNews(
              institutionQuery(inst.name, inst.ticker),
            )
            if (status === 403) {
              quotaExhausted = true
              break
            }
            const saved = await saveArticles(articles, inst.id)
            results.push({ query: inst.name, ...saved })
          } catch (e) {
            console.error(`[fetch-news] ${inst.name}: ${String(e)}`)
            results.push({ query: inst.name, error: String(e) })
          }
        }
      } else if (runInstitutions) {
        console.warn(
          '[fetch-news] GNEWS_API_KEY is not set: skipping the per-institution loop (GNews only)',
        )
      }

      if (!quotaExhausted) {
        for (const broadQuery of BROAD_QUERIES) {
          try {
            const { articles, status } = await fetchGNews(broadQuery, {
              country: 'us',
            })
            if (status === 403) {
              quotaExhausted = true
              break
            }
            if (NEWS_API_KEY) {
              try {
                articles.push(...(await fetchNewsApi(broadQuery)))
              } catch (e) {
                console.error(
                  `[fetch-news] NewsAPI error for ${broadQuery}: ${String(e)}`,
                )
              }
            }
            const saved = await saveArticles(articles, null)
            results.push({ query: broadQuery.slice(0, 50), ...saved })
          } catch (e) {
            console.error(`[fetch-news] ${broadQuery}: ${String(e)}`)
            results.push({ query: broadQuery.slice(0, 50), error: String(e) })
          }
        }
      }

      const newArticles = results.reduce(
        (sum, r) => sum + ('new_articles' in r ? r.new_articles : 0),
        0,
      )
      console.log(
        `[fetch-news] ${JSON.stringify({ utc_hour: hour, institutions_fetched: runInstitutions, queries: results.length, new_articles: newArticles, gnews_quota_exhausted: quotaExhausted })}`,
      )

      if (quotaExhausted) {
        return json(
          {
            success: false,
            gnews_quota_exhausted: true,
            status: 403,
            institutions_fetched: runInstitutions,
            results,
          },
          429,
        )
      }
      return json({
        success: true,
        utc_hour: hour,
        institutions_fetched: runInstitutions,
        results,
      })
    }

    if (quotaExhausted) {
      return json(
        { success: false, gnews_quota_exhausted: true, status: 403, results },
        429,
      )
    }
    return json({ success: true, results })
  } catch (error) {
    console.error(`[fetch-news] run failed: ${String(error)}`)
    return json({ error: String(error) }, 500)
  }
})

/**
 * `"Name"`, plus ` OR "TICKER"` when the ticker is at least four letters.
 * Short tickers (C, KEY, ALLY's cousins) are ordinary words and only add
 * noise; the quoted name alone is specific enough for them.
 */
function institutionQuery(name: string, ticker: string | null): string {
  const phrase = `"${name.replace(/"/g, '').trim()}"`
  const symbol = (ticker ?? '').trim()
  if (
    symbol.length >= MIN_TICKER_LENGTH_FOR_QUERY &&
    /^[A-Za-z]+$/.test(symbol)
  ) {
    return `${phrase} OR "${symbol.toUpperCase()}"`
  }
  return phrase
}

/** ISO 8601 without milliseconds, the form GNews accepts for `from=`. */
function lookbackIso(): string {
  return new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
}

function deduplicateArticles(
  articles: NormalizedArticle[],
): NormalizedArticle[] {
  const seen = new Set<string>()
  return articles.filter((a) => {
    if (!a.url || seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
}

async function fetchGNews(
  query: string,
  options: { country?: string } = {},
): Promise<GNewsResult> {
  if (!GNEWS_API_KEY) return { articles: [], status: 0 }

  const params = new URLSearchParams({
    q: query,
    lang: 'en',
    max: '10',
    from: lookbackIso(),
    apikey: GNEWS_API_KEY,
  })
  if (options.country) params.set('country', options.country)

  // The key travels in the query string: the label keeps it out of the log.
  const response = await fetchWithRetry(
    `https://gnews.io/api/v4/search?${params.toString()}`,
    undefined,
    {
      label: `gnews.io/api/v4/search q=${query.slice(0, 40)}`,
      defaultRetryAfterMs: 2_000,
      maxRetryAfterMs: 5_000,
    },
  )
  if (!response.ok) {
    if (response.status === 403) {
      console.error(
        '[fetch-news] GNews returned 403: daily quota exhausted, ending the run',
      )
    }
    return { articles: [], status: response.status }
  }

  const data = await response.json()
  const articles: Array<{
    title: string
    source: { name: string }
    url: string
    publishedAt: string
    content: string | null
    description: string | null
  }> = data.articles ?? []

  return {
    status: response.status,
    articles: articles.map((a) => ({
      title: a.title,
      source: a.source.name,
      url: a.url,
      published_at: a.publishedAt,
      raw_content: a.content || a.description || '',
    })),
  }
}

async function fetchNewsApi(query: string): Promise<NormalizedArticle[]> {
  if (!NEWS_API_KEY) return []

  const params = new URLSearchParams({
    q: query,
    sortBy: 'publishedAt',
    pageSize: '10',
    language: 'en',
    from: lookbackIso(),
  })
  const response = await fetchWithRetry(
    `https://newsapi.org/v2/everything?${params.toString()}`,
    { headers: { 'X-Api-Key': NEWS_API_KEY } },
    { label: `newsapi.org/v2/everything q=${query.slice(0, 40)}` },
  )
  if (!response.ok) return []

  const data = await response.json()
  const articles: Array<{
    title: string
    source: { name: string }
    url: string
    publishedAt: string
    content: string | null
    description: string | null
  }> = data.articles ?? []

  return articles.map((a) => ({
    title: a.title,
    source: a.source.name,
    url: a.url,
    published_at: a.publishedAt,
    raw_content: a.content || a.description || '',
  }))
}

interface ArticleRow {
  institution_id: string | null
  title: string
  source: string
  url: string
  published_at: string
  raw_content: string
}

/**
 * Set after the first 42P10 so the rest of this isolate goes straight to the
 * fallback instead of failing one upsert per query. A fresh isolate (after a
 * redeploy, or idle recycling) tries the upsert again.
 */
let urlIndexMissing = false

/** Inserts the new articles for one query; returns how many were new. */
async function saveArticles(
  articles: NormalizedArticle[],
  institutionId: string | null,
): Promise<SaveResult> {
  const rows: ArticleRow[] = deduplicateArticles(articles).map((a) => ({
    institution_id: institutionId,
    title: a.title,
    source: a.source,
    url: a.url,
    published_at: a.published_at,
    raw_content: a.raw_content,
  }))
  const fetched = articles.length
  if (rows.length === 0) return { fetched, new_articles: 0 }

  if (!urlIndexMissing) {
    const { data, error } = await supabase
      .from('news_articles')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
      .select('id')
    if (!error) return { fetched, new_articles: data?.length ?? 0 }
    if (error.code !== '42P10') {
      console.error(`[fetch-news] insert error: ${error.code} ${error.message}`)
      return { fetched, new_articles: 0, error: 'Insert failed' }
    }
    urlIndexMissing = true
    console.warn(
      '[fetch-news] news_articles has no unique index on url yet (42P10); falling back to select-then-insert until supabase/ops/06_dedupe_news_urls.sql is applied',
    )
  }
  return insertUnseenUrls(rows, fetched)
}

/** The pre-index path: read the URLs that exist, insert the rest. */
async function insertUnseenUrls(
  rows: ArticleRow[],
  fetched: number,
): Promise<SaveResult> {
  const { data: existing, error: selectError } = await supabase
    .from('news_articles')
    .select('url')
    .in(
      'url',
      rows.map((r) => r.url),
    )
  if (selectError) {
    console.error(`[fetch-news] url lookup error: ${selectError.message}`)
    return { fetched, new_articles: 0, error: 'Lookup failed' }
  }

  const existingUrls = new Set((existing ?? []).map((e) => e.url))
  const newRows = rows.filter((r) => !existingUrls.has(r.url))
  if (newRows.length === 0) return { fetched, new_articles: 0 }

  const { data, error: insertError } = await supabase
    .from('news_articles')
    .insert(newRows)
    .select('id')
  if (insertError) {
    console.error(
      `[fetch-news] insert error: ${insertError.code} ${insertError.message}`,
    )
    return { fetched, new_articles: 0, error: 'Insert failed' }
  }
  return { fetched, new_articles: data?.length ?? newRows.length }
}
