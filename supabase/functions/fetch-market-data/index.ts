import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY")!

interface DailyQuote {
  "4. close": string
  "5. volume": string
}

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

      const response = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${inst.ticker}&apikey=${ALPHA_VANTAGE_KEY}`,
      )

      if (!response.ok) {
        console.error(`Alpha Vantage error for ${inst.ticker}:`, await response.text())
        continue
      }

      const data = await response.json()
      const timeSeries: Record<string, DailyQuote> = data["Time Series (Daily)"] ?? {}
      const dates = Object.keys(timeSeries).sort().reverse()

      if (dates.length < 2) continue

      const todayClose = parseFloat(timeSeries[dates[0]]["4. close"])
      const yesterdayClose = parseFloat(timeSeries[dates[1]]["4. close"])
      const dailyChange = ((todayClose - yesterdayClose) / yesterdayClose) * 100

      // Check for significant drop
      if (dailyChange < -5) {
        let severity: "low" | "medium" | "high" | "critical" = "low"
        if (dailyChange < -30) severity = "critical"
        else if (dailyChange < -15) severity = "high"
        else if (dailyChange < -10) severity = "medium"

        await supabase.from("risk_signals").insert({
          institution_id: inst.id,
          category: "stock_drop",
          severity,
          title: `Stock dropped ${Math.abs(dailyChange).toFixed(1)}% in one session`,
          description: `${inst.ticker} closed at $${todayClose.toFixed(2)}, down from $${yesterdayClose.toFixed(2)} (${dailyChange.toFixed(1)}%)`,
          signal_value: dailyChange,
          signal_date: new Date(dates[0]).toISOString(),
          source: "Alpha Vantage",
        })

        results.push({ institution: inst.name, drop: dailyChange })
      }

      // Check 5-day trend
      if (dates.length >= 5) {
        const fiveDayClose = parseFloat(timeSeries[dates[4]]["4. close"])
        const fiveDayChange = ((todayClose - fiveDayClose) / fiveDayClose) * 100

        if (fiveDayChange < -20) {
          await supabase.from("risk_signals").insert({
            institution_id: inst.id,
            category: "stock_drop",
            severity: fiveDayChange < -40 ? "critical" : "high",
            title: `Stock dropped ${Math.abs(fiveDayChange).toFixed(1)}% over 5 trading days`,
            description: `${inst.ticker} fell from $${fiveDayClose.toFixed(2)} to $${todayClose.toFixed(2)} over the last 5 trading days`,
            signal_value: fiveDayChange,
            signal_date: new Date(dates[0]).toISOString(),
            source: "Alpha Vantage",
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
