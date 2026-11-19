import { useQuery } from '@tanstack/react-query'
import { listTradingSignals } from '@/api/trading'
import { queryKeys } from '@/queries/keys'

/** All trading signals, newest first (Open/Closed status is derived by the page). */
export function useTradingSignals() {
  return useQuery({
    queryKey: queryKeys.tradingSignals,
    queryFn: listTradingSignals,
  })
}
