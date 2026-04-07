import { format } from 'date-fns'
import { SentimentTag } from '../shared/SentimentTag'
import type { NewsArticle } from '../../../shared/types'

export function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) {
    return <p className="text-sm text-slate-400">No articles collected yet.</p>
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <div
          key={article.id}
          className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-white">
                {article.url ? (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {article.title}
                  </a>
                ) : (
                  article.title
                )}
              </h4>
              {article.summary && (
                <p className="mt-1 text-xs text-slate-400 line-clamp-2">{article.summary}</p>
              )}
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                {article.source && <span>{article.source}</span>}
                {article.published_at && (
                  <span>{format(new Date(article.published_at), 'MMM d, yyyy')}</span>
                )}
              </div>
            </div>
            {article.sentiment_label && (
              <SentimentTag sentiment={article.sentiment_label} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
