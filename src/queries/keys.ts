import type { NewsListOptions } from '@/api/news'
import type { SignalListOptions } from '@/api/signals'

/** Stable array for ids so the same set in a different order hits the same cache entry. */
const idSet = (ids: readonly string[]) => [...ids].sort().join(',')

/**
 * Query-key factory. Every key starts with its resource so
 * `invalidateQueries({ queryKey: queryKeys.positions })` sweeps the whole family.
 * Pass `since` dates as 'YYYY-MM-DD' strings computed once per page (useMemo/useState)
 * so the key does not churn every render.
 */
export const queryKeys = {
  institutions: ['institutions'] as const,
  latestScores: ['latest-scores'] as const,
  scoreHistory: (institutionId: string, days: number | 'all') =>
    ['score-history', institutionId, days] as const,
  snapshots: (since: string) => ['snapshots', 'recent', since] as const,
  pricedSnapshots: (
    since: string | undefined,
    institutionIds: readonly string[] | undefined,
  ) =>
    [
      'snapshots',
      'priced',
      since ?? 'all',
      institutionIds ? idSet(institutionIds) : 'all',
    ] as const,
  benchmarks: (since: string | undefined, tickers: readonly string[]) =>
    ['benchmarks', since ?? 'all', [...tickers].join(',')] as const,
  latestPrices: (institutionIds: readonly string[]) =>
    ['latest-prices', idSet(institutionIds)] as const,
  signals: (institutionId: string, opts: SignalListOptions) =>
    ['signals', 'institution', institutionId, opts] as const,
  recentSignals: (days: number) => ['signals', 'recent', days] as const,
  latestSignals: (limit: number) => ['signals', 'latest', limit] as const,
  news: (institutionId: string, opts: NewsListOptions) =>
    ['news', institutionId, opts] as const,
  tradingSignals: ['trading-signals'] as const,
  positions: ['positions'] as const,
  alerts: ['alerts'] as const,
  alertHistory: (limit: number) => ['alert-history', limit] as const,
  freshness: ['freshness'] as const,
}
