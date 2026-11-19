import type { ReactNode } from 'react'
import type { Institution, LatestPrice } from '@shared/types'
import { Badge, Card, Delta, ScoreValue, Skeleton } from '@/components/ui'
import {
  EM_DASH,
  formatCurrency,
  formatDate,
  formatDateTimeUTC,
  formatRelative,
} from '@/lib/format'
import { isStaleScore, type LatestPoint } from './history'
import { formatSector } from './labels'

export interface HeroCardProps {
  institution: Institution
  /** Newest hourly score; undefined while the latest-scores query loads. */
  latest: LatestPoint | undefined
  /** Latest score minus yesterday's snapshot; undefined while loading, null when either side is missing. */
  delta24h: number | null | undefined
  /** Newest priced snapshot; undefined while loading, null when the bank has none. */
  price: LatestPrice | null | undefined
}

function Stat({
  label,
  sub,
  children,
}: {
  label: string
  sub?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-text tabular-nums">{children}</dd>
      {sub ? <dd className="text-xs text-muted tabular-nums">{sub}</dd> : null}
    </div>
  )
}

/** Name, ticker/sector, the score with its band, Δ24h, latest price and when the score was computed. */
export function HeroCard({
  institution,
  latest,
  delta24h,
  price,
}: HeroCardProps) {
  const stale = latest ? isStaleScore(latest.computedAt) : false
  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="text-[28px] leading-8 font-semibold text-text">
            {institution.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {institution.ticker ? (
              <Badge tone="accent">{institution.ticker}</Badge>
            ) : null}
            <Badge>{formatSector(institution.sector)}</Badge>
            {institution.is_active ? null : <Badge>Inactive</Badge>}
          </div>
        </div>

        <div className="shrink-0 md:text-right">
          {latest === undefined ? (
            <span role="status" aria-busy="true" className="block">
              <span className="sr-only">Loading score</span>
              <Skeleton className="h-8 w-32 md:ml-auto" />
            </span>
          ) : (
            <ScoreValue score={latest.score} size="lg" withLevel />
          )}
          <dl className="mt-3 grid grid-cols-3 gap-4 md:flex md:justify-end md:gap-6">
            <Stat label="Δ24h" sub="vs yesterday's snapshot">
              {delta24h === undefined ? (
                <Skeleton inline className="h-4 w-10" />
              ) : (
                <Delta value={delta24h} digits={1} positiveIsBad showIcon />
              )}
            </Stat>
            <Stat
              label="Price"
              sub={
                price
                  ? `as of ${formatDate(price.date)}`
                  : price === null
                    ? 'no priced snapshot'
                    : undefined
              }
            >
              {price === undefined ? (
                <Skeleton inline className="h-4 w-16" />
              ) : price ? (
                <>
                  {formatCurrency(price.price, { signed: false })}{' '}
                  <Delta value={price.change_pct} suffix="%" />
                </>
              ) : (
                <span className="text-muted">{EM_DASH}</span>
              )}
            </Stat>
            <Stat
              label="Scored"
              sub={
                latest?.computedAt
                  ? formatDateTimeUTC(latest.computedAt, { withDate: true })
                  : undefined
              }
            >
              {latest === undefined ? (
                <Skeleton inline className="h-4 w-14" />
              ) : latest.computedAt ? (
                <span className={stale ? 'text-sev-medium' : undefined}>
                  {formatRelative(latest.computedAt)}
                  {stale ? (
                    <span className="sr-only"> (older than 2 h)</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted">{EM_DASH}</span>
              )}
            </Stat>
          </dl>
        </div>
      </div>
    </Card>
  )
}
