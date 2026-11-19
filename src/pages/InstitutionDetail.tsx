import { Bell, TrendingDown } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { ButtonLink, PageHeader, PageState } from '@/components/ui'
import { ComponentsCard } from '@/features/institution/ComponentsCard'
import { HeroCard } from '@/features/institution/HeroCard'
import { delta24h, type LatestPoint } from '@/features/institution/history'
import { formatSector } from '@/features/institution/labels'
import { NewsCard } from '@/features/institution/NewsCard'
import { ScoreHistoryCard } from '@/features/institution/ScoreHistoryCard'
import { SignalsCard } from '@/features/institution/SignalsCard'
import { useInstitution } from '@/features/institution/useInstitution'
import { useLatestPrices } from '@/queries/useLatestPrices'
import { useLatestScores } from '@/queries/useLatestScores'
import { useScoreHistory } from '@/queries/useScoreHistory'

/** The page frame used before the institution resolves (loading, error, not found). */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader back title="Institution" />
      {children}
    </div>
  )
}

export function InstitutionDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const institution = useInstitution(id)
  const latestScores = useLatestScores()
  const ids = useMemo(() => [id], [id])
  const prices = useLatestPrices(ids)
  // 30 days is enough for yesterday's snapshot and is the chart's default range,
  // so the first paint makes one history request, not two.
  const history = useScoreHistory(id, 30)

  const latestRow = latestScores.data?.scores.get(id)
  const latest: LatestPoint | undefined = latestScores.data
    ? {
        score: latestRow?.score ?? null,
        computedAt: latestRow?.computed_at ?? null,
      }
    : undefined
  const delta =
    latest && history.data ? delta24h(history.data, latest) : undefined
  const price = prices.data ? (prices.data.get(id) ?? null) : undefined
  const heroError = latestScores.error ?? prices.error ?? history.error

  if (institution.isError)
    return (
      <Frame>
        <PageState
          kind="error"
          title="Could not load this institution"
          error={institution.error}
          onRetry={() => void institution.refetch()}
        />
      </Frame>
    )
  if (institution.isPending)
    return (
      <Frame>
        <PageState kind="loading" skeleton="card" />
      </Frame>
    )
  const bank = institution.data
  if (!bank)
    return (
      <Frame>
        <PageState
          kind="notFound"
          title="Institution not found"
          message={`No institution has the id ${id}.`}
          backLabel="Back to Watchlist"
        />
      </Frame>
    )

  const sector = formatSector(bank.sector)
  const alertTo = `/alerts?${new URLSearchParams({ institution_id: bank.id })}`
  const positionParams = new URLSearchParams({
    tab: 'positions',
    institution_id: bank.id,
    direction: 'short',
  })
  if (price) positionParams.set('price', String(price.price))
  const positionTo = `/trading?${positionParams}`

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={bank.name}
        description={bank.ticker ? `${bank.ticker} · ${sector}` : sector}
        right={
          <>
            <ButtonLink to={alertTo} icon={<Bell />}>
              Create alert
            </ButtonLink>
            <ButtonLink
              to={positionTo}
              variant="primary"
              icon={<TrendingDown />}
            >
              Open position
            </ButtonLink>
          </>
        }
      />

      {heroError ? (
        <PageState
          kind="error"
          title="Could not load the latest score"
          error={heroError}
          onRetry={() => {
            void latestScores.refetch()
            void prices.refetch()
            void history.refetch()
          }}
        />
      ) : (
        <HeroCard
          institution={bank}
          latest={latest}
          delta24h={delta}
          price={price}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ScoreHistoryCard institutionId={bank.id} latest={latest} />
        </div>
        <div className="min-w-0">
          <ComponentsCard
            components={latestRow?.score_components}
            isPending={latestScores.isPending}
            isError={latestScores.isError}
            error={latestScores.error}
            onRetry={() => void latestScores.refetch()}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SignalsCard institutionId={bank.id} />
        </div>
        <div className="min-w-0">
          <NewsCard institutionId={bank.id} />
        </div>
      </div>
    </div>
  )
}
