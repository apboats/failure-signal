import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY")!
const GNEWS_API_KEY = Deno.env.get("GNEWS_API_KEY") ?? ""

interface NormalizedArticle {
  title: string
  source: string
  url: string
  published_at: string
  raw_content: string
}

const BROAD_QUERIES = [
  'bank liquidity crisis OR bank failure OR bank run OR emergency funding',
  'bank credit downgrade OR default risk OR counterparty risk',
  'investment bank layoffs OR losses OR write-down',
  'bank stock plunge OR shares crash OR bailout OR regulatory action',
  'bank client withdrawal OR fund redemption OR prime brokerage',
]

Deno.serve(async (req) => {
  try {
    const { institution_id } = await req.json().catch(() => ({ institution_id: null }))

    const results = []

    if (institution_id) {
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
      // Fetch for tracked institutions
      const { data: institutions } = await supabase
        .from("institutions")
        .select("id, name, ticker")
        .eq("is_active", true)

      for (const inst of institutions ?? []) {
        const query = `${inst.name} ${inst.ticker ?? ""}`.trim()
        const articles = await fetchFromAllSources(query)
        const saved = await saveAndAnalyze(articles, inst.id)
        results.push({ query: inst.name, ...saved })
      }

      // Broad financial distress searches (auto-discovery)
      for (const broadQuery of BROAD_QUERIES) {
        const articles = await fetchFromAllSources(broadQuery)
        const saved = await saveAndAnalyze(articles, null)
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

// Fetch from both NewsAPI and GNews, merge and deduplicate
async function fetchFromAllSources(query: string): Promise<NormalizedArticle[]> {
  const allArticles: NormalizedArticle[] = []

  // GNews first (full article content)
  if (GNEWS_API_KEY) {
    try {
      const gnewsArticles = await fetchGNews(query)
      allArticles.push(...gnewsArticles)
    } catch (e) {
      console.error("GNews fetch error:", e)
    }
  }

  // NewsAPI second (truncated content, but wider coverage)
  try {
    const newsApiArticles = await fetchNewsApi(query)
    allArticles.push(...newsApiArticles)
  } catch (e) {
    console.error("NewsAPI fetch error:", e)
  }

  // Deduplicate by URL
  const seen = new Set<string>()
  return allArticles.filter((a) => {
    if (seen.has(a.url)) return false
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
    console.error("GNews API error:", await response.text())
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
    // GNews returns full content — use it, fall back to description
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

  const { data: inserted, error: insertError } = await supabase
    .from("news_articles")
    .insert(newArticles)
    .select("id")

  if (insertError) {
    console.error("Insert error:", insertError)
    return { new_articles: 0, error: "Insert failed" }
  }

  for (const article of inserted ?? []) {
    EdgeRuntime.waitUntil(
      supabase.functions.invoke("analyze-news", {
        body: { article_id: article.id },
      })
    )
  }

  return { new_articles: newArticles.length }
}
