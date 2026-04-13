import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const FINNHUB_KEY = Deno.env.get("FINNHUB_KEY") ?? ""

// Finnhub free tier: 60 calls/min. With 94 institutions + 100ms delay = ~10 seconds.
Deno.serve(async (req) => {
  try {
    const { institution_id } = await req.json().catch(() => ({ institution_id: null }))

    let query = supabase.from("institutions").select("id, name, ticker").eq("is_active", true).not("ticker", "is", null)
    if (institution_id) query = query.eq("id", institution_id)

    const { data: institutions, error: instError } = await query
    if (instError) throw instError

    const results = []

    for (const inst of institutions ?? []) {
      if (!inst.ticker) continue

      // Skip tickers that aren't US-listed (Finnhub free tier is US stocks)
      // Foreign tickers contain dots (e.g. 1398.HK, 601166.SS)
      if (inst.ticker.includes(".")) continue

      await new Promise((r) => setTimeout(r, 100)) // Stay under 60 req/min

      try {
        const quote = await fetchFinnhubQuote(inst.ticker)
        if (!quote) continue

        const dailyChange = quote.dp // Percent change

        // Check for significant drop
        if (dailyChange < -5) {
          let severity: "low" | "medium" | "high" | "critical" = "low"
          if (dailyChange < -30) severity = "critical"
          else if (dailyChange < -15) severity = "high"
          else if (dailyChange < -10) severity = "medium"

          // Dedupe: one stock_drop signal per institution per day
          const today = new Date().toISOString().split("T")[0]
          const { data: existing } = await supabase
            .from("risk_signals")
            .select("id")
            .eq("institution_id", inst.id)
            .eq("category", "stock_drop")
            .gte("signal_date", today)
            .limit(1)

          if (!existing || existing.length === 0) {
            await supabase.from("risk_signals").insert({
              institution_id: inst.id,
              category: "stock_drop",
              severity,
              title: `Stock dropped ${Math.abs(dailyChange).toFixed(1)}% in one session`,
              description: `${inst.ticker} at $${quote.c.toFixed(2)}, previous close $${quote.pc.toFixed(2)} (${dailyChange.toFixed(1)}%)`,
              signal_value: dailyChange,
              signal_date: new Date().toISOString(),
              source: "Finnhub",
            })

            results.push({ institution: inst.name, ticker: inst.ticker, drop: dailyChange, price: quote.c })
          }
        }
      } catch (e) {
        console.error(`Finnhub error for ${inst.ticker}:`, e)
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

interface FinnhubQuote {
  c: number  // Current price
  d: number  // Change
  dp: number // Percent change
  h: number  // High
  l: number  // Low
  o: number  // Open
  pc: number // Previous close
  t: number  // Timestamp
}

async function fetchFinnhubQuote(ticker: string): Promise<FinnhubQuote | null> {
  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`,
  )

  if (!response.ok) return null

  const data: FinnhubQuote = await response.json()

  // Finnhub returns zeros for invalid tickers
  if (!data.c || data.c === 0) return null

  return data
}
