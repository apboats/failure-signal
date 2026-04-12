import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const PANIC_KEYWORDS = [
  "bank run", "collapse", "insolvent", "bankrupt", "pulling money",
  "get your money out", "liquidity crisis", "fdic", "bail out", "bailout",
  "default", "ponzi", "fraud", "seized", "emergency", "plunge", "crash",
  "withdraw", "withdrawal", "failing", "failed", "contagion",
]

const SUBREDDITS = ["wallstreetbets", "investing", "stocks", "banking", "finance"]

Deno.serve(async () => {
  try {
    const { data: institutions } = await supabase
      .from("institutions")
      .select("id, name, ticker")
      .eq("is_active", true)
      .not("ticker", "is", null)

    const results = []

    for (const inst of institutions ?? []) {
      if (!inst.ticker) continue

      const searchTerms = [inst.ticker, inst.name]
      let totalMentions = 0
      let panicMentions = 0
      let stocktwitsScore = 0

      // Reddit search across subreddits
      for (const subreddit of SUBREDDITS) {
        for (const term of searchTerms) {
          await new Promise((r) => setTimeout(r, 500)) // Reddit rate limit

          try {
            const redditData = await fetchReddit(subreddit, term)
            for (const post of redditData) {
              totalMentions++
              const text = `${post.title} ${post.selftext}`.toLowerCase()
              if (PANIC_KEYWORDS.some((kw) => text.includes(kw))) {
                panicMentions++
              }
            }
          } catch {
            // Reddit can be flaky, continue
          }
        }
      }

      // StockTwits
      try {
        await new Promise((r) => setTimeout(r, 300))
        stocktwitsScore = await fetchStockTwits(inst.ticker)
      } catch {
        // Continue without StockTwits data
      }

      // Generate signals based on findings
      if (totalMentions > 0 || stocktwitsScore > 0) {
        await generateSocialSignal(inst.id, inst.name, totalMentions, panicMentions, stocktwitsScore)
      }

      results.push({
        institution: inst.name,
        total_mentions: totalMentions,
        panic_mentions: panicMentions,
        stocktwits_bearish: stocktwitsScore,
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

interface RedditPost {
  title: string
  selftext: string
  score: number
  num_comments: number
  created_utc: number
}

async function fetchReddit(subreddit: string, query: string): Promise<RedditPost[]> {
  const encoded = encodeURIComponent(query)
  const response = await fetch(
    `https://www.reddit.com/r/${subreddit}/search.json?q=${encoded}&sort=new&t=day&restrict_sr=1&limit=25`,
    {
      headers: {
        "User-Agent": "FailureSignal/1.0",
      },
    },
  )

  if (!response.ok) return []

  const data = await response.json()
  return (data.data?.children ?? []).map((c: { data: RedditPost }) => c.data)
}

async function fetchStockTwits(ticker: string): Promise<number> {
  const response = await fetch(
    `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
  )

  if (!response.ok) return 0

  const data = await response.json()
  const messages = data.messages ?? []

  if (messages.length === 0) return 0

  let bearish = 0
  let total = 0

  for (const msg of messages) {
    if (msg.entities?.sentiment) {
      total++
      if (msg.entities.sentiment.basic === "Bearish") bearish++
    }
  }

  return total > 0 ? (bearish / total) * 100 : 0
}

async function generateSocialSignal(
  institutionId: string,
  institutionName: string,
  totalMentions: number,
  panicMentions: number,
  stocktwitsBearish: number,
) {
  const panicRatio = totalMentions > 0 ? panicMentions / totalMentions : 0

  let severity: "low" | "medium" | "high" | "critical" | null = null
  let title = ""

  // Both Reddit and StockTwits showing panic
  if (panicMentions >= 20 && stocktwitsBearish > 70) {
    severity = "critical"
    title = `Social media panic: ${panicMentions} panic posts + ${stocktwitsBearish.toFixed(0)}% bearish on StockTwits`
  }
  // High Reddit panic volume
  else if (panicMentions >= 20) {
    severity = "high"
    title = `${panicMentions} panic-related social posts about ${institutionName} in 24h`
  }
  // Moderate combined signals
  else if (panicMentions >= 5 && stocktwitsBearish > 60) {
    severity = "high"
    title = `Elevated social concern: ${panicMentions} panic posts, ${stocktwitsBearish.toFixed(0)}% bearish StockTwits`
  }
  // Moderate Reddit panic or high StockTwits bearishness
  else if (panicMentions >= 5 || stocktwitsBearish > 75) {
    severity = "medium"
    title = `Social sentiment turning negative for ${institutionName}`
  }
  // Low level but worth tracking
  else if (panicMentions >= 2 || (panicRatio > 0.5 && totalMentions >= 3)) {
    severity = "low"
    title = `Emerging social media concern about ${institutionName}`
  }

  if (!severity) return

  // Avoid duplicate signals — one per institution per 6 hours
  const sixHoursAgo = new Date()
  sixHoursAgo.setHours(sixHoursAgo.getHours() - 6)

  const { data: existing } = await supabase
    .from("risk_signals")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("category", "social_panic")
    .gte("signal_date", sixHoursAgo.toISOString())
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from("risk_signals").insert({
    institution_id: institutionId,
    category: "social_panic",
    severity,
    title,
    description: `Reddit: ${totalMentions} total mentions, ${panicMentions} panic-related (${(panicRatio * 100).toFixed(0)}% panic ratio). StockTwits: ${stocktwitsBearish.toFixed(0)}% bearish sentiment. Panic keywords tracked: bank run, collapse, insolvent, liquidity crisis, etc.`,
    signal_value: panicMentions,
    signal_date: new Date().toISOString(),
    source: "Reddit + StockTwits",
  })
}
