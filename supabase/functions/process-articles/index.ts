import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.39"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

// Process 15 articles per run. At every 5 minutes = 180/hour.
const BATCH_SIZE = 15

const SYSTEM_PROMPT = `You are a financial risk analyst specializing in early detection of institutional failure.
Analyze news articles for signs of financial distress, using the Bear Stearns and Silicon Valley Bank collapses as reference patterns.

For each article, provide a JSON response with:
- institution_name: the primary financial institution the article is about (full legal name, e.g. "Goldman Sachs Group" not "Goldman")
- institution_ticker: the stock ticker if known (e.g. "GS"), or null
- institution_sector: one of "banking", "investment_bank", "insurance", "fintech", "asset_management"
- sentiment_score: number from -1.0 (very negative) to 1.0 (very positive)
- sentiment_label: one of "very_negative", "negative", "neutral", "positive", "very_positive"
- relevance_score: 0.0 to 1.0 indicating relevance to institutional failure risk
- summary: one paragraph summary focusing on risk implications
- signals: array of detected risk signals, each with:
  - category: one of "stock_drop", "cds_spike", "liquidity_warning", "client_withdrawal", "counterparty_action", "regulatory_signal", "credit_downgrade", "executive_departure", "news_sentiment", "insider_selling", "lawmaker_selling"
  - severity: "low", "medium", "high", or "critical"
  - title: short description of the signal
  - description: detailed context

IMPORTANT: Only identify publicly traded, for-profit financial institutions. Set institution_name to null if the article is about:
- Central banks (Federal Reserve, ECB, Bank of England, etc.)
- Government-owned or state-controlled banks (e.g. Chinese state banks, development banks)
- Cooperatives that are not publicly traded
- Non-financial companies
- Crypto exchanges or DeFi platforms
- Already-defunct institutions (e.g. FTX, Credit Suisse, First Republic)

The institution MUST have a tradable stock ticker. If you cannot identify one, set institution_name to null.
Respond ONLY with valid JSON. No markdown formatting.`

Deno.serve(async () => {
  try {
    // Grab oldest unanalyzed articles
    const { data: articles, error: fetchError } = await supabase
      .from("news_articles")
      .select("*")
      .is("analyzed_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchError) throw fetchError
    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, pending: 0 }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Check total pending for reporting
    const { count } = await supabase
      .from("news_articles")
      .select("*", { count: "exact", head: true })
      .is("analyzed_at", null)

    let processed = 0
    let failed = 0

    for (const article of articles) {
      try {
        // Resolve institution name if we already have one linked
        let institutionName = ""
        let institutionTicker = ""

        if (article.institution_id) {
          const { data: inst } = await supabase
            .from("institutions")
            .select("name, ticker")
            .eq("id", article.institution_id)
            .single()
          if (inst) {
            institutionName = inst.name
            institutionTicker = inst.ticker ?? ""
          }
        }

        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Analyze this article${institutionName ? ` about ${institutionName} (${institutionTicker})` : ""}:\n\nTitle: ${article.title}\nSource: ${article.source}\nDate: ${article.published_at}\n\nContent:\n${article.raw_content || article.title}`,
            },
          ],
        })

        let responseText = message.content[0].type === "text" ? message.content[0].text : ""
        responseText = responseText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
        const analysis = JSON.parse(responseText)

        let institutionId = article.institution_id

        // Auto-discover institution if article came from broad search
        if (!institutionId && analysis.institution_name) {
          institutionId = await findOrCreateInstitution(
            analysis.institution_name,
            analysis.institution_ticker,
            analysis.institution_sector,
          )
          if (institutionId) {
            await supabase
              .from("news_articles")
              .update({ institution_id: institutionId })
              .eq("id", article.id)
          }
        }

        // Update article with analysis
        await supabase
          .from("news_articles")
          .update({
            sentiment_score: analysis.sentiment_score,
            sentiment_label: analysis.sentiment_label,
            relevance_score: analysis.relevance_score,
            summary: analysis.summary,
            analyzed_at: new Date().toISOString(),
          })
          .eq("id", article.id)

        // Insert detected signals
        if (institutionId && analysis.signals && analysis.signals.length > 0) {
          const signals = analysis.signals.map((s: { category: string; severity: string; title: string; description: string }) => ({
            institution_id: institutionId,
            news_article_id: article.id,
            category: s.category,
            severity: s.severity,
            title: s.title,
            description: s.description,
            signal_date: article.published_at || new Date().toISOString(),
            source: article.source,
          }))

          await supabase.from("risk_signals").insert(signals)
        }

        processed++
      } catch (e) {
        console.error(`Failed to analyze article ${article.id}:`, e)
        // Mark as analyzed with error to avoid retrying forever
        await supabase
          .from("news_articles")
          .update({
            analyzed_at: new Date().toISOString(),
            summary: `[Analysis failed: ${String(e).slice(0, 200)}]`,
          })
          .eq("id", article.id)
        failed++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        pending: (count ?? 0) - articles.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

async function findOrCreateInstitution(
  name: string,
  ticker: string | null,
  sector: string | null,
): Promise<string | null> {
  if (!name) return null

  const { data: existing } = await supabase
    .from("institutions")
    .select("id")
    .or(`name.ilike.%${name}%${ticker ? `,ticker.eq.${ticker}` : ""}`)
    .limit(1)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from("institutions")
    .insert({
      name,
      ticker: ticker || null,
      sector: sector || "banking",
      is_active: true,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Failed to create institution:", error)
    return null
  }

  console.log(`Auto-discovered institution: ${name} (${ticker})`)
  return created.id
}
