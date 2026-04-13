import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY") ?? ""
const GNEWS_API_KEY = Deno.env.get("GNEWS_API_KEY") ?? ""

// With paid GNews (1,000 req/day), fetch all institutions every run.
// ~94 banks + 5 broad queries = ~99 requests per run.
// Running hourly = ~99 requests/day (well under 1,000 limit).

interface NormalizedArticle {
  title: string
  source: string
  url: string
  published_at: string
  raw_content: string
}

// GNews uses simple keyword queries — no OR/AND operators
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
  try {
    const { institution_id } = await req.json().catch(() => ({ institution_id: null }))

    const results = []

    if (institution_id) {
      // Single institution fetch
      const { data: inst } = await supabase
        .from("institutions")
        .select("id, name, ticker")
        .eq("id", institution_id)
        .single()

      if (inst) {
        const query = `${inst.name} ${inst.ticker ?? ""}`.trim()
        const articles = await fetchFromAllSources(query)
        const saved = await saveAndAnalyze(articles, inst.id)
        results.push({ query: inst.name, ...saved })
      }
    } else {
      // Fetch all active institutions every run
      const { data: institutions } = await supabase
        .from("institutions")
        .select("id, name, ticker")
        .eq("is_active", true)

      for (const inst of institutions ?? []) {
        const query = `${inst.name} ${inst.ticker ?? ""}`.trim()
        const articles = await fetchGNews(query)
        const saved = await saveAndAnalyze(articles, inst.id)
        results.push({ query: inst.name, ...saved })
      }

      // Also run broad distress queries (auto-discovery)
      for (const broadQuery of BROAD_QUERIES) {
        const articles = await fetchGNews(broadQuery)
        // Supplement with NewsAPI for broader coverage on distress queries
        if (NEWS_API_KEY) {
          const newsApiArticles = await fetchNewsApi(broadQuery)
          articles.push(...newsApiArticles)
        }
        const deduplicated = deduplicateArticles(articles)
        const saved = await saveAndAnalyze(deduplicated, null)
        results.push({ query: broadQuery.slice(0, 50), ...saved })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

async function fetchFromAllSources(query: string): Promise<NormalizedArticle[]> {
  const allArticles: NormalizedArticle[] = []

  if (GNEWS_API_KEY) {
    try {
      allArticles.push(...await fetchGNews(query))
    } catch (e) {
      console.error("GNews fetch error:", e)
    }
  }

  if (NEWS_API_KEY) {
    try {
      allArticles.push(...await fetchNewsApi(query))
    } catch (e) {
      console.error("NewsAPI fetch error:", e)
    }
  }

  return deduplicateArticles(allArticles)
}

function deduplicateArticles(articles: NormalizedArticle[]): NormalizedArticle[] {
  const seen = new Set<string>()
  return articles.filter((a) => {
    if (!a.url || seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
}

async function fetchGNews(query: string): Promise<NormalizedArticle[]> {
  const encoded = encodeURIComponent(query)
  const response = await fetch(
    `https://gnews.io/api/v4/search?q=${encoded}&lang=en&max=10&apikey=${GNEWS_API_KEY}`,
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error("GNews API error:", errorText)
    return []
  }

  const data = await response.json()
  const articles: Array<{
    title: string
    source: { name: string }
    url: string
    publishedAt: string
    content: string
    description: string
  }> = data.articles ?? []

  return articles.map((a) => ({
    title: a.title,
    source: a.source.name,
    url: a.url,
    published_at: a.publishedAt,
    raw_content: a.content || a.description || "",
  }))
}

async function fetchNewsApi(query: string): Promise<NormalizedArticle[]> {
  const encoded = encodeURIComponent(query)
  const response = await fetch(
    `https://newsapi.org/v2/everything?q=${encoded}&sortBy=publishedAt&pageSize=10&language=en`,
    { headers: { "X-Api-Key": NEWS_API_KEY } },
  )

  if (!response.ok) {
    console.error("NewsAPI error:", await response.text())
    return []
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

  return articles.map((a) => ({
    title: a.title,
    source: a.source.name,
    url: a.url,
    published_at: a.publishedAt,
    raw_content: a.content || a.description || "",
  }))
}

// Just save articles — analysis is handled by process-articles on a schedule
async function saveAndAnalyze(articles: NormalizedArticle[], institutionId: string | null) {
  const urls = articles.map((a) => a.url).filter(Boolean)
  if (urls.length === 0) return { new_articles: 0 }

  const { data: existing } = await supabase
    .from("news_articles")
    .select("url")
    .in("url", urls)

  const existingUrls = new Set((existing ?? []).map((e) => e.url))

  const newArticles = articles
    .filter((a) => a.url && !existingUrls.has(a.url))
    .map((a) => ({
      institution_id: institutionId,
      title: a.title,
      source: a.source,
      url: a.url,
      published_at: a.published_at,
      raw_content: a.raw_content,
    }))

  if (newArticles.length === 0) return { new_articles: 0 }

  const { error: insertError } = await supabase
    .from("news_articles")
    .insert(newArticles)

  if (insertError) {
    console.error("Insert error:", insertError)
    return { new_articles: 0, error: "Insert failed" }
  }

  return { new_articles: newArticles.length }
}
