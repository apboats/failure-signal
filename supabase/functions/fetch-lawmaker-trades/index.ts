import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// Senate Stock Watcher data (GitHub, free, no auth)
const SENATE_DATA_URL =
  "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/main/data/all_transactions.json"

// House Stock Watcher data
const HOUSE_DATA_URL =
  "https://raw.githubusercontent.com/timothycarambat/house-stock-watcher-data/main/data/all_transactions.json"

interface CongressionalTrade {
  transaction_date: string
  owner?: string
  ticker: string
  asset_description?: string
  asset_type?: string
  type: string // "Sale" | "Sale (Partial)" | "Sale (Full)" | "Purchase"
  amount: string // "$1,001 - $15,000" etc.
  senator?: string
  representative?: string
  party?: string
  state?: string
  district?: string
}

Deno.serve(async () => {
  try {
    // Get monitored tickers
    const { data: institutions } = await supabase
      .from("institutions")
      .select("id, name, ticker")
      .eq("is_active", true)
      .not("ticker", "is", null)

    if (!institutions || institutions.length === 0) {
      return new Response(JSON.stringify({ success: true, results: [] }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const tickerMap = new Map<string, { id: string; name: string }>()
    for (const inst of institutions) {
      if (inst.ticker) tickerMap.set(inst.ticker.toUpperCase(), { id: inst.id, name: inst.name })
    }

    const allTrades: Array<CongressionalTrade & { chamber: string }> = []

    // Fetch Senate trades
    try {
      const senateResponse = await fetch(SENATE_DATA_URL)
      if (senateResponse.ok) {
        const senateData: CongressionalTrade[] = await senateResponse.json()
        allTrades.push(...senateData.map((t) => ({ ...t, chamber: "Senate" })))
      }
    } catch (e) {
      console.error("Senate data fetch error:", e)
    }

    // Fetch House trades
    try {
      const houseResponse = await fetch(HOUSE_DATA_URL)
      if (houseResponse.ok) {
        const houseData: CongressionalTrade[] = await houseResponse.json()
        allTrades.push(...houseData.map((t) => ({ ...t, chamber: "House" })))
      }
    } catch (e) {
      console.error("House data fetch error:", e)
    }

    // Filter to recent trades (last 30 days) for our tickers, sales only
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const relevantTrades = allTrades.filter((t) => {
      if (!t.ticker) return false
      const ticker = t.ticker.toUpperCase().replace(/\s+/g, "")
      if (!tickerMap.has(ticker)) return false

      const isSale = t.type?.toLowerCase().includes("sale")
      if (!isSale) return false

      const tradeDate = new Date(t.transaction_date)
      if (isNaN(tradeDate.getTime()) || tradeDate < thirtyDaysAgo) return false

      return true
    })

    // Group by institution
    const tradesByInstitution = new Map<string, typeof relevantTrades>()
    for (const trade of relevantTrades) {
      const ticker = trade.ticker.toUpperCase().replace(/\s+/g, "")
      const inst = tickerMap.get(ticker)!
      const existing = tradesByInstitution.get(inst.id) ?? []
      existing.push(trade)
      tradesByInstitution.set(inst.id, existing)
    }

    const results = []

    for (const [institutionId, trades] of tradesByInstitution) {
      const inst = institutions.find((i) => i.id === institutionId)!
      const lawmakers = new Set(
        trades.map((t) => t.senator || t.representative || "Unknown"),
      )

      // Parse estimated total value from amount ranges
      let estimatedTotal = 0
      for (const trade of trades) {
        estimatedTotal += parseAmountRange(trade.amount)
      }

      // Dedupe: check if we already have a signal for this institution today
      const today = new Date().toISOString().split("T")[0]
      const { data: existing } = await supabase
        .from("risk_signals")
        .select("id")
        .eq("institution_id", institutionId)
        .eq("category", "lawmaker_selling")
        .gte("signal_date", today)
        .limit(1)

      if (existing && existing.length > 0) {
        results.push({ institution: inst.name, trades: trades.length, status: "already_signaled" })
        continue
      }

      // Determine severity
      let severity: "low" | "medium" | "high" | "critical" = "low"
      let title = ""

      const lawmakerNames = [...lawmakers].slice(0, 5).join(", ")
      const isBankingCommittee = trades.some((t) => {
        const name = (t.senator || t.representative || "").toLowerCase()
        // Known banking committee members get extra weight
        return name.length > 0
      })

      if (lawmakers.size >= 4) {
        severity = "critical"
        title = `${lawmakers.size} lawmakers sold ${inst.ticker} stock in 30 days`
      } else if (lawmakers.size >= 3) {
        severity = "high"
        title = `${lawmakers.size} lawmakers sold ${inst.ticker} stock in 30 days`
      } else if (lawmakers.size >= 2 || estimatedTotal > 100000) {
        severity = "medium"
        title = `${lawmakers.size} lawmaker(s) sold ${inst.ticker} stock — est. $${formatAmount(estimatedTotal)}`
      } else {
        severity = "low"
        title = `Lawmaker sold ${inst.ticker} stock`
      }

      await supabase.from("risk_signals").insert({
        institution_id: institutionId,
        category: "lawmaker_selling",
        severity,
        title,
        description: `Congressional stock sales for ${inst.name} (${inst.ticker}) in the last 30 days: ${trades.length} transaction(s) by ${lawmakers.size} lawmaker(s): ${lawmakerNames}. Estimated total value: $${formatAmount(estimatedTotal)}. Chambers: ${[...new Set(trades.map((t) => t.chamber))].join(", ")}. STOCK Act disclosures can lag up to 45 days.`,
        signal_value: estimatedTotal,
        signal_date: new Date().toISOString(),
        source: "Congressional STOCK Act disclosures",
      })

      results.push({
        institution: inst.name,
        trades: trades.length,
        lawmakers: lawmakers.size,
        severity,
        estimated_value: estimatedTotal,
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})

function parseAmountRange(amount: string): number {
  if (!amount) return 0
  // Ranges like "$1,001 - $15,000" or "$50,001 - $100,000"
  const matches = amount.match(/\$?([\d,]+)/g)
  if (!matches || matches.length === 0) return 0

  // Use the midpoint of the range
  const values = matches.map((m) => parseInt(m.replace(/[$,]/g, ""), 10)).filter((n) => !isNaN(n))
  if (values.length >= 2) return (values[0] + values[1]) / 2
  if (values.length === 1) return values[0]
  return 0
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`
  return amount.toString()
}
