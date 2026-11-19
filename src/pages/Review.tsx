import { useMemo, useState } from 'react'
import {
  Card,
  PageHeader,
  PageState,
  TabPanel,
  Tabs,
  useTabParam,
} from '@/components/ui'
import { CandidateTable } from '@/features/review/CandidateTable'
import type { ReviewDecision, ReviewStatus } from '@/lib/database.types'
import type { Institution } from '@shared/types'
import {
  useCandidates,
  useMentionCounts,
  useReviewInstitution,
} from '@/queries/useReview'

const TABS = ['pending', 'ignored', 'approved'] as const
const TAB_LABEL: Record<ReviewStatus, string> = {
  pending: 'Pending',
  ignored: 'Ignored',
  approved: 'Tracked',
}

/**
 * /review: companies the news pipeline discovered. New ones arrive inactive;
 * classify-pending estimates how likely each is to be a US bank from its SEC
 * record, and tracking one adds it to the Watchlist and scoring.
 */
export function Review() {
  const [tab, setTab] = useTabParam(TABS)
  const candidates = useCandidates()
  const review = useReviewInstitution()
  const [savingId, setSavingId] = useState<string | null>(null)

  const data = candidates.data
  const byStatus = useMemo(() => {
    const groups: Record<ReviewStatus, Institution[]> = {
      pending: [],
      ignored: [],
      approved: [],
    }
    for (const row of data ?? []) {
      const status = row.review_status ?? 'pending'
      groups[status].push(row)
    }
    return groups
  }, [data])

  const visibleIds = useMemo(
    () => byStatus[tab].map((row) => row.id),
    [byStatus, tab],
  )
  const mentions = useMentionCounts(visibleIds)

  const decide = (id: string, decision: ReviewDecision) => {
    setSavingId(id)
    review.mutate({ id, decision }, { onSettled: () => setSavingId(null) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review"
        description="Companies the news pipeline found that are not tracked yet. Track the US banks; ignore the rest."
      />
      {candidates.isError ? (
        <PageState
          kind="error"
          title="Could not load the review queue"
          error={candidates.error}
          onRetry={() => void candidates.refetch()}
        />
      ) : candidates.isPending ? (
        <PageState kind="loading" skeleton="table" />
      ) : (
        <>
          <Tabs
            tabs={TABS.map((id) => ({
              id,
              label: TAB_LABEL[id],
              count: byStatus[id].length,
            }))}
            value={tab}
            onChange={setTab}
          />
          <TabPanel id={tab}>
            <Card
              title={TAB_LABEL[tab]}
              count={byStatus[tab].length}
              padded={false}
            >
              {review.isError ? (
                <p
                  role="alert"
                  className="border-b border-border px-4 py-3 text-sm text-neg md:px-5"
                >
                  {review.error.message}
                </p>
              ) : null}
              <CandidateTable
                status={tab}
                rows={byStatus[tab]}
                mentions={mentions.data}
                mentionsLoading={mentions.isLoading}
                savingId={savingId}
                onDecide={decide}
              />
            </Card>
            <p className="mt-3 text-xs text-muted">
              Likelihood is a heuristic from the company&apos;s SEC industry
              code, listing exchange and headquarters, refreshed hourly.
              Tracking a company adds it to the Watchlist and scoring from the
              next hourly run.
            </p>
          </TabPanel>
        </>
      )}
    </div>
  )
}
