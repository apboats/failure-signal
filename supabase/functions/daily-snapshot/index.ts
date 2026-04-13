import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? ""

// Trading signal thresholds
const SHORT_ENTRY_THRESHOLD = 35 // Score above this = consider shorting
const SHORT_EXIT_THRESHOLD = 15 // Score drops below this = consider closing short
const WATCH_THRESHOLD = 20 // Score above this = put on watch list
const SCORE_SPIKE_THRESHOLD = 10 // Score jump of this many points in a day = signal

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().split("T")[0]

    const { data: institutions } = await supabase
      .from("institutions")
      .select("id, name, ticker, sector")
      .eq("is_active", true)

    const results = []

    for (const inst of institutions ?? []) {
      // Get latest risk score
      const { data: latestScore } = await supabase
        .from("risk_scores")
        .select("score, score_components, signal_count")
        .eq("institution_id", inst.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .single()

      const currentScore = latestScore ? Number(latestScore.score) : 0

      // Get yesterday's snapshot for comparison
      const { data: prevSnapshot } = await supabase
        .from("daily_snapshots")
        .select("risk_score, stock_price")
        .eq("institution_id", inst.id)
        .lt("snapshot_date", today)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single()

      const prevScore = prevSnapshot ? Number(prevSnapshot.risk_score) : 0
      const scoreChange = currentScore - prevScore

      // Fetch stock price if ticker exists and we have an API key
      let stockPrice: number | null = null
      let stockChangePct: number | null = null
      let volume: number | null = null

      if (inst.ticker && ALPHA_VANTAGE_KEY) {
        await new Promise((r) => setTimeout(r, 300)) // Rate limit
        const priceData = await fetchStockPrice(inst.ticker)
        if (priceData) {
          stockPrice = priceData.price
          stockChangePct = priceData.changePct
          volume = priceData.volume
        }
      }

      // Upsert daily snapshot
      await supabase.from("daily_snapshots").upsert(
        {
          institution_id: inst.id,
          snapshot_date: today,
          risk_score: currentScore,
          score_components: latestScore?.score_components ?? {},
          signal_count: latestScore?.signal_count ?? 0,
          stock_price: stockPrice,
          stock_change_pct: stockChangePct,
          volume,
        },
        { onConflict: "institution_id,snapshot_date" },
      )

      // Generate trading signals based on score thresholds and changes
      const signals = generateTradingSignals(
        inst.id,
        inst.name,
        currentScore,
        prevScore,
        scoreChange,
        stockPrice,
      )

      for (const signal of signals) {
        // Deactivate old signals of same type for this institution
        await supabase
          .from("trading_signals")
          .update({ is_active: false })
          .eq("institution_id", inst.id)
          .eq("signal_type", signal.signal_type)
          .eq("is_active", true)

        await supabase.from("trading_signals").insert({
          institution_id: inst.id,
          signal_type: signal.signal_type,
          score_at_signal: currentScore,
          score_change: scoreChange,
          price_at_signal: stockPrice,
          reason: signal.reason,
          is_active: true,
        })
      }

      results.push({
        institution: inst.name,
        score: currentScore,
        score_change: scoreChange,
        stock_price: stockPrice,
        signals: signals.length,
      })
    }

    return new Response(JSON.stringify({ success: true, date: today, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

function generateTradingSignals(
  institutionId: string,
  name: string,
  currentScore: number,
  prevScore: number,
  scoreChange: number,
  stockPrice: number | null,
): Array<{ signal_type: string; reason: string }> {
  const signals: Array<{ signal_type: string; reason: string }> = []

  // Short entry: score crossed above threshold
  if (currentScore >= SHORT_ENTRY_THRESHOLD && prevScore < SHORT_ENTRY_THRESHOLD) {
    signals.push({
      signal_type: "short_entry",
      reason: `${name} risk score crossed ${SHORT_ENTRY_THRESHOLD}% (now ${currentScore.toFixed(1)}%, was ${prevScore.toFixed(1)}%). Multiple risk signals converging — consider short position.`,
    })
  }

  // Short exit: score dropped back below exit threshold
  if (currentScore < SHORT_EXIT_THRESHOLD && prevScore >= SHORT_EXIT_THRESHOLD) {
    signals.push({
      signal_type: "short_exit",
      reason: `${name} risk score dropped below ${SHORT_EXIT_THRESHOLD}% (now ${currentScore.toFixed(1)}%). Risk appears to be subsiding — consider closing short position.`,
    })
  }

  // Watch: score crossed watch threshold
  if (currentScore >= WATCH_THRESHOLD && prevScore < WATCH_THRESHOLD) {
    signals.push({
      signal_type: "watch",
      reason: `${name} risk score elevated to ${currentScore.toFixed(1)}% (up from ${prevScore.toFixed(1)}%). Not yet actionable but warrants close monitoring.`,
    })
  }

  // Spike detection: large single-day score jump
  if (scoreChange >= SCORE_SPIKE_THRESHOLD) {
    signals.push({
      signal_type: "short_entry",
      reason: `${name} risk score spiked +${scoreChange.toFixed(1)} points in one day (${prevScore.toFixed(1)}% → ${currentScore.toFixed(1)}%). Rapid deterioration detected.`,
    })
  }

  // Score dropping fast — potential exit signal
  if (scoreChange <= -SCORE_SPIKE_THRESHOLD && currentScore < SHORT_ENTRY_THRESHOLD) {
    signals.push({
      signal_type: "short_exit",
      reason: `${name} risk score dropped ${Math.abs(scoreChange).toFixed(1)} points in one day. Risk may be resolving.`,
    })
  }

  return signals
}

async function fetchStockPrice(ticker: string): Promise<{ price: number; changePct: number; volume: number } | null> {
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`,
    )

    if (!response.ok) return null

    const data = await response.json()
    const quote = data["Global Quote"]
    if (!quote || !quote["05. price"]) return null

    return {
      price: parseFloat(quote["05. price"]),
      changePct: parseFloat(quote["10. change percent"]?.replace("%", "") ?? "0"),
      volume: parseInt(quote["06. volume"] ?? "0", 10),
    }
  } catch {
    return null
  }
}
