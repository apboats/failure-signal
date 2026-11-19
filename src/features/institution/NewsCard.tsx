import { ExternalLink } from 'lucide-react'
import type { NewsArticle } from '@shared/types'
import { listForInstitution, NEWS_PAGE_SIZE } from '@/api/news'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  ListRows,
  PageState,
} from '@/components/ui'
import { sentimentLabel, sentimentTone } from '@/domain/signals'
import { formatCount, formatDate } from '@/lib/format'
import { queryKeys } from '@/queries/keys'
import { ListSkeleton } from './ListSkeleton'
import { displaySummary } from './news'
import { usePagedList } from './usePagedList'

function ArticleRow({ article }: { article: NewsArticle }) {
  const summary = displaySummary(article.summary)
  const meta = [
    article.source,
    article.published_at ? formatDate(article.published_at) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <ListRow
      title={
        article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-start gap-1 rounded hover:underline"
          >
            <span>{article.title}</span>
            <ExternalLink
              aria-hidden="true"
              className="mt-1 size-3.5 shrink-0 text-muted"
            />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          article.title
        )
      }
      meta={
        meta || summary ? (
          <>
            {meta}
            {summary ? (
              <span className="mt-1 line-clamp-2 block [overflow-wrap:anywhere]">
                {summary}
              </span>
            ) : null}
          </>
        ) : undefined
      }
      trailing={
        article.sentiment_label ? (
          <Badge tone={sentimentTone(article.sentiment_label)}>
            {sentimentLabel(article.sentiment_label)}
          </Badge>
        ) : undefined
      }
    />
  )
}

/** The bank's collected articles, newest published first, with the exact total and Load more. */
export function NewsCard({ institutionId }: { institutionId: string }) {
  const list = usePagedList<NewsArticle>({
    queryKey: [...queryKeys.news(institutionId, {}), 'pages'],
    pageSize: NEWS_PAGE_SIZE,
    fetchPage: (offset) => listForInstitution(institutionId, { offset }),
  })

  if (list.isError)
    return (
      <PageState
        kind="error"
        title="Could not load news"
        error={list.error}
        onRetry={list.refetch}
      />
    )

  return (
    <Card
      title="News"
      count={list.isPending ? null : list.total}
      padded={false}
    >
      <div className="divide-y divide-border">
        {list.isPending ? (
          <ListSkeleton rows={4} />
        ) : list.rows.length === 0 ? (
          <EmptyState title="No articles collected yet for this bank" />
        ) : (
          <ListRows>
            {list.rows.map((article) => (
              <ArticleRow key={article.id} article={article} />
            ))}
          </ListRows>
        )}

        {list.hasMore && list.total !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5">
            <span className="text-xs text-muted tabular-nums">
              Showing {formatCount(list.rows.length)} of{' '}
              {formatCount(list.total)}
            </span>
            <Button
              size="sm"
              onClick={list.loadMore}
              loading={list.isLoadingMore}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
