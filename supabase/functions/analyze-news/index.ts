import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.39"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })

const SYSTEM_PROMPT = `You are a financial risk analyst specializing in early detection of institutional failure.
Analyze news articles for signs of financial distress, using the Bear Stearns collapse as a reference pattern.

For each article, provide a JSON response with:
- sentiment_score: number from -1.0 (very negative) to 1.0 (very positive)
- sentiment_label: one of "very_negative", "negative", "neutral", "positive", "very_positive"
- relevance_score: 0.0 to 1.0 indicating relevance to institutional failure risk
- summary: one paragraph summary focusing on risk implications
- signals: array of detected risk signals, each with:
  - category: one of "stock_drop", "cds_spike", "liquidity_warning", "client_withdrawal", "counterparty_action", "regulatory_signal", "credit_downgrade", "executive_departure", "news_sentiment"
  - severity: "low", "medium", "high", or "critical"
  - title: short description of the signal
  - description: detailed context

Respond ONLY with valid JSON. No markdown formatting.`

Deno.serve(async (req) => {
  try {
    const { article_id } = await req.json()

    // Fetch the article
    const { data: article, error: fetchError } = await supabase
      .from("news_articles")
      .select("*, institutions(name, ticker)")
      .eq("id", article_id)
      .single()

    if (fetchError || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), { status: 404 })
    }

    const institution = article.institutions as { name: string; ticker: string }

    // Call Claude for analysis
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this article about ${institution.name} (${institution.ticker}):\n\nTitle: ${article.title}\nSource: ${article.source}\nDate: ${article.published_at}\n\nContent:\n${article.raw_content || article.title}`,
        },
      ],
    })

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""
    const analysis = JSON.parse(responseText)

    // Update the article with sentiment data
    await supabase
      .from("news_articles")
      .update({
        sentiment_score: analysis.sentiment_score,
        sentiment_label: analysis.sentiment_label,
        relevance_score: analysis.relevance_score,
        summary: analysis.summary,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", article_id)

    // Insert detected signals
    if (analysis.signals && analysis.signals.length > 0) {
      const signals = analysis.signals.map((s: { category: string; severity: string; title: string; description: string }) => ({
        institution_id: article.institution_id,
        news_article_id: article_id,
        category: s.category,
        severity: s.severity,
        title: s.title,
        description: s.description,
        signal_date: article.published_at || new Date().toISOString(),
        source: article.source,
      }))

      await supabase.from("risk_signals").insert(signals)
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
