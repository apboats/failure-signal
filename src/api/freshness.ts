import { supabase, unwrap } from '@/lib/supabase'

/**
 * When each pipeline stage last produced data. Cron cadence (supabase/cron_fix.sql):
 * scores hourly at :15, prices daily at 22:00 UTC, signals hourly (legitimately
 * zero in quiet hours, so shown without a colour).
 */
export interface Freshness {
  /** Newest risk_scores.computed_at (ISO timestamp) or null when the table is empty. */
  scoresAt: string | null
  /** Newest daily_snapshots.snapshot_date that carries a stock price ('YYYY-MM-DD') or null. */
  pricesDate: string | null
  /** Newest risk_signals.created_at (ISO timestamp) or null. */
  signalsAt: string | null
}

/** Three parallel LIMIT 1 probes; the view is deliberately not referenced. */
export async function getFreshness(): Promise<Freshness> {
  const [scores, prices, signals] = await Promise.all([
    supabase
      .from('risk_scores')
      .select('computed_at')
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('daily_snapshots')
      .select('snapshot_date')
      .not('stock_price', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('risk_signals')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    scoresAt: unwrap(scores)?.computed_at ?? null,
    pricesDate: unwrap(prices)?.snapshot_date ?? null,
    signalsAt: unwrap(signals)?.created_at ?? null,
  }
}
