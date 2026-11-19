import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import { Input, PageHeader, PageState } from '@/components/ui'
import { FreshnessPill } from '@/features/watchlist/FreshnessPill'
import { InstitutionTable } from '@/features/watchlist/InstitutionTable'
import { LatestSignalsCard } from '@/features/watchlist/LatestSignalsCard'
import { MoversCard } from '@/features/watchlist/MoversCard'
import { StatTiles } from '@/features/watchlist/StatTiles'
import {
  useWatchlistData,
  type TileFilter,
} from '@/features/watchlist/useWatchlistData'
import { formatCount } from '@/lib/format'

/**
 * Watchlist (/): which banks are heating up and whether the pipeline is alive.
 * Only the institutions query gates the page; every other query reports into
 * its own tile, card or cell.
 */
export function Dashboard() {
  const [search, setSearch] = useState('')
  const [tile, setTile] = useState<TileFilter | null>(null)
  const searchId = useId()
  const data = useWatchlistData()
  const { institutions, activeRows, status } = data

  const description =
    activeRows.length > 0
      ? `${formatCount(activeRows.length)} US banks scored hourly from news, filings, market and social signals.`
      : 'US banks scored hourly from news, filings, market and social signals.'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description={description}
        right={
          <>
            <FreshnessPill />
            <div className="relative w-56 max-w-full">
              <label htmlFor={searchId} className="sr-only">
                Search banks by ticker or name
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted"
              />
              <Input
                id={searchId}
                type="search"
                autoComplete="off"
                placeholder="Ticker or name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-8"
              />
            </div>
          </>
        }
      />

      {institutions.isError ? (
        <PageState
          kind="error"
          title="Could not load institutions"
          error={institutions.error}
          onRetry={() => void institutions.refetch()}
          retrying={institutions.isFetching}
        />
      ) : institutions.isPending ? (
        <div className="space-y-6">
          <PageState kind="loading" skeleton="tiles" />
          <PageState kind="loading" skeleton="table" />
        </div>
      ) : institutions.data.length === 0 ? (
        <PageState
          kind="empty"
          title="No institutions"
          message="The institutions table is empty, so there is nothing to score or list."
        />
      ) : (
        <>
          <StatTiles
            tiles={data.tiles}
            status={{
              scores: status.scores,
              signals: status.signals,
              trading: status.trading,
            }}
            active={tile}
            onToggle={(next) =>
              setTile((current) => (current === next ? null : next))
            }
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MoversCard
              rows={activeRows}
              status={{ scores: status.scores, snapshots: status.snapshots }}
            />
            <LatestSignalsCard
              events={data.events}
              index={data.index}
              status={{
                latestSignals: status.latestSignals,
                history: status.history,
              }}
              now={data.now}
            />
          </div>
          <InstitutionTable
            rows={data.rows}
            search={search}
            tile={tile}
            status={{
              scores: status.scores,
              snapshots: status.snapshots,
              signals: status.signals,
              trading: status.trading,
            }}
            now={data.now}
          />
        </>
      )}
    </div>
  )
}
