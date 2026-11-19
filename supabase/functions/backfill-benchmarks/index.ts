import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { fetchWithRetry } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Uses Yahoo Finance unofficial API to backfill historical XLF and SPY prices.
// Free, no API key required. Returns OHLC data for any date range.
Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const results: Record<string, number> = {}

    for (const ticker of ['XLF', 'SPY']) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d`
      // retries: 0 keeps the existing single attempt; the helper logs the
      // status and a body prefix of any non-OK response.
      const response = await fetchWithRetry(
        url,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        { retries: 0, label: `yahoo ${ticker}` },
      )

      if (!response.ok) {
        console.error(
          `[backfill-benchmarks] Yahoo fetch failed for ${ticker}: ${response.status}`,
        )
        results[ticker] = 0
        continue
      }

      const data = await response.json()
      const result = data?.chart?.result?.[0]
      if (!result) {
        console.error(`[backfill-benchmarks] No data for ${ticker}`)
        continue
      }

      const timestamps: number[] = result.timestamp ?? []
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? []

      let inserted = 0
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i]
        if (close == null) continue

        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
        const prevClose = i > 0 ? closes[i - 1] : null
        const changePct = prevClose
          ? ((close - prevClose) / prevClose) * 100
          : 0

        const { error } = await supabase.from('benchmark_snapshots').upsert(
          {
            ticker,
            snapshot_date: date,
            price: close,
            change_pct: changePct,
          },
          { onConflict: 'ticker,snapshot_date' },
        )

        if (error) {
          console.error(
            `[backfill-benchmarks] upsert failed for ${ticker} ${date}: ${error.message}`,
          )
        } else {
          inserted++
        }
      }

      results[ticker] = inserted
    }

    return json({ success: true, results })
  } catch (error) {
    console.error('[backfill-benchmarks] run failed:', error)
    return json({ success: false, error: String(error) }, 500)
  }
})
