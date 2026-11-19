import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_BENCHMARK_TICKERS,
  listBenchmarks,
  listPricedSnapshots,
  listRecentSnapshots,
} from '@/api/snapshots'
import { queryKeys } from '@/queries/keys'

/** All daily snapshots since a 'YYYY-MM-DD' date (sparklines, day-over-day deltas). Paged; ~1.8k rows for 30 days. */
export function useSnapshots(since: string) {
  return useQuery({
    queryKey: queryKeys.snapshots(since),
    queryFn: () => listRecentSnapshots({ since }),
  })
}

/** Every priced snapshot (event study / lead-lag input). Paged over ~11k rows live; cached 5 min. */
export function usePricedSnapshots(
  since?: string,
  institutionIds?: readonly string[],
) {
  return useQuery({
    queryKey: queryKeys.pricedSnapshots(since, institutionIds),
    queryFn: () => listPricedSnapshots({ since, institutionIds }),
  })
}

/** XLF / SPY closes since a date, for market-relative excess returns. */
export function useBenchmarks(
  since?: string,
  tickers: readonly string[] = DEFAULT_BENCHMARK_TICKERS,
) {
  return useQuery({
    queryKey: queryKeys.benchmarks(since, tickers),
    queryFn: () => listBenchmarks({ since, tickers }),
  })
}
