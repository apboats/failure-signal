import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// Backfills institution stock prices in daily_snapshots using Yahoo Finance.
// Updates any rows missing stock_price for institutions with US-listed tickers.
Deno.serve(async () => {
  try {
    const { data: institutions } = await supabase
      .from("institutions")
      .select("id, name, ticker")
      .eq("is_active", true)
      .not("ticker", "is", null)

    if (!institutions) {
      return new Response(JSON.stringify({ success: true, message: "No institutions" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const results: Array<{ name: string; updated: number }> = []

    for (const inst of institutions) {
      // Skip foreign-exchange tickers
      if (!inst.ticker || inst.ticker.includes(".")) continue

      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${inst.ticker}?range=3mo&interval=1d`
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })

        if (!response.ok) {
          results.push({ name: inst.name, updated: 0 })
          continue
        }

        const data = await response.json()
        const result = data?.chart?.result?.[0]
        if (!result) continue

        const timestamps: number[] = result.timestamp ?? []
        const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

        // Build a map of date -> price
        const priceByDate = new Map<string, { price: number; changePct: number }>()
        for (let i = 0; i < timestamps.length; i++) {
          const close = closes[i]
          if (close == null) continue
          const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0]
          const prevClose = i > 0 ? closes[i - 1] : null
          const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0
          priceByDate.set(date, { price: close, changePct })
        }

        // Update existing snapshots that are missing stock_price
        const { data: snaps } = await supabase
          .from("daily_snapshots")
          .select("id, snapshot_date, stock_price")
          .eq("institution_id", inst.id)

        let updated = 0
        for (const snap of snaps ?? []) {
          if (snap.stock_price != null) continue
          const priceData = priceByDate.get(snap.snapshot_date)
          if (!priceData) continue

          const { error } = await supabase
            .from("daily_snapshots")
            .update({
              stock_price: priceData.price,
              stock_change_pct: priceData.changePct,
            })
            .eq("id", snap.id)

          if (!error) updated++
        }

        results.push({ name: inst.name, updated })
      } catch (e) {
        console.error(`Failed for ${inst.name}:`, e)
        results.push({ name: inst.name, updated: 0 })
      }
    }

    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0)
    return new Response(JSON.stringify({ success: true, total_updated: totalUpdated, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
