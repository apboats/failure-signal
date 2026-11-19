import { supabase, unwrap } from '@/lib/supabase'
import type { TradingSignal } from '@shared/types'

/**
 * Trading signals, newest first, active and inactive alike (the Trading page
 * derives Open/Closed status client-side: a short_entry is closed once a later
 * short_exit exists for the same bank). 79 rows live; bounded at 1000.
 */
export async function listTradingSignals(): Promise<TradingSignal[]> {
  return unwrap(
    await supabase
      .from('trading_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1000),
  )
}
