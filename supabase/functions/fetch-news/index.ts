import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY")!

interface NewsApiArticle {
  title: string
  source: { name: string }
  url: string
  publishedAt: string
  content: string | null
  description: string | null
}

Deno.serve(async (req) => {
  try {
    const { institution_id } = await req.json().catch(() => ({ institution_id: null }))

    // Get institutions to fetch news for
    let query = supabase.from("institutions").select("id, name, ticker").eq("is_active", true)
    if (institution_id) query = query.eq("id", institution_id)

    const { data: institutions, error: instError } = await query
    if (instError) throw instError

    const results = []

    for (const inst of institutions ?? []) {
      const searchQuery = encodeURIComponent(`${inst.name} ${inst.ticker ?? ""}`.trim())

      const response = await fetch(
        `https://newsapi.org/v2/everything?q=${searchQuery}&sortBy=publishedAt&pageSize=10&language=en`,
        { headers: { "X-Api-Key": NEWS_API_KEY } },
      )

      if (!response.ok) {
        console.error(`NewsAPI error for ${inst.name}:`, await response.text())
        continue
      }

      const data = await response.json()
      const articles: NewsApiArticle[] = data.articles ?? []

      // Deduplicate against existing URLs
      const urls = articles.map((a) => a.url).filter(Boolean)
      const { data: existing } = await supabase
        .from("news_articles")
        .select("url")
        .eq("institution_id", inst.id)
        .in("url", urls)

      const existingUrls = new Set((existing ?? []).map((e) => e.url))

      const newArticles = articles
        .filter((a) => a.url && !existingUrls.has(a.url))
        .map((a) => ({
          institution_id: inst.id,
          title: a.title,
          source: a.source.name,
          url: a.url,
          published_at: a.publishedAt,
          raw_content: a.content || a.description,
        }))

      if (newArticles.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from("news_articles")
          .insert(newArticles)
          .select("id")

        if (insertError) {
          console.error(`Insert error for ${inst.name}:`, insertError)
        } else {
          // Trigger analysis for each new article
          for (const article of inserted ?? []) {
            await supabase.functions.invoke("analyze-news", {
              body: { article_id: article.id },
            })
          }
        }

        results.push({ institution: inst.name, new_articles: newArticles.length })
      } else {
        results.push({ institution: inst.name, new_articles: 0 })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
