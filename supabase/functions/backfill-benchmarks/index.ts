import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// Uses Yahoo Finance unofficial API to backfill historical XLF and SPY prices.
// Free, no API key required. Returns OHLC data for any date range.
Deno.serve(async () => {
  try {
    const results: Record<string, number> = {}

    for (const ticker of ["XLF", "SPY"]) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d`
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      })

      if (!response.ok) {
        console.error(`Yahoo fetch failed for ${ticker}:`, response.status)
        results[ticker] = 0
        continue
      }

      const data = await response.json()
      const result = data?.chart?.result?.[0]
      if (!result) {
        console.error(`No data for ${ticker}`)
        continue
      }

      const timestamps: number[] = result.timestamp ?? []
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

      let inserted = 0
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i]
        if (close == null) continue

        const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0]
        const prevClose = i > 0 ? closes[i - 1] : null
        const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0

        const { error } = await supabase.from("benchmark_snapshots").upsert(
          {
            ticker,
            snapshot_date: date,
            price: close,
            change_pct: changePct,
          },
          { onConflict: "ticker,snapshot_date" },
        )

        if (!error) inserted++
      }

      results[ticker] = inserted
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
