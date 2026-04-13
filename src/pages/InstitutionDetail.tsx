import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useScoreHistory } from '../hooks/useRiskScores'
import { useSignals } from '../hooks/useSignals'
import { useNewsArticles } from '../hooks/useNewsArticles'
import { ScoreChart } from '../components/institution/ScoreChart'
import { SignalTimeline } from '../components/institution/SignalTimeline'
import { NewsFeed } from '../components/institution/NewsFeed'
import { RiskBreakdown } from '../components/institution/RiskBreakdown'
import { ScoreBadge } from '../components/shared/ScoreBadge'
import type { Institution, RiskScore } from '../../shared/types'

export function InstitutionDetail() {
  const { id } = useParams<{ id: string }>()
  const [institution, setInstitution] = useState<Institution | null>(null)
  const [latestScore, setLatestScore] = useState<RiskScore | null>(null)

  const { scores: scoreHistory, loading: loadingScores } = useScoreHistory(id!)
  const { signals, loading: loadingSignals } = useSignals(id!)
  const { articles, loading: loadingArticles } = useNewsArticles(id!)

  useEffect(() => {
    if (!id) return
    supabase
      .from('institutions')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => setInstitution(data))

    supabase
      .from('risk_scores')
      .select('*')
      .eq('institution_id', id)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setLatestScore(data))
  }, [id])

  if (!institution) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading...
      </div>
    )
  }

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white md:mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 md:mb-6">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white md:text-2xl">{institution.name}</h2>
          {institution.ticker && (
            <span className="text-xs text-slate-400 md:text-sm">{institution.ticker} · {institution.sector}</span>
          )}
        </div>
        {latestScore && <ScoreBadge score={Number(latestScore.score)} />}
      </div>

      <div className="space-y-4 md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
        {/* Score History Chart */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:col-span-2 md:p-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-300 md:mb-4">Risk Score History</h3>
          {loadingScores ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">Loading...</div>
          ) : (
            <ScoreChart scores={scoreHistory} />
          )}
        </div>

        {/* Risk Breakdown */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-300 md:mb-4">Risk Breakdown</h3>
          {latestScore?.score_components ? (
            <RiskBreakdown components={latestScore.score_components} />
          ) : (
            <p className="text-sm text-slate-400">No breakdown available.</p>
          )}
        </div>

        {/* Signal Timeline */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:col-span-2 md:p-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-300 md:mb-4">
            Risk Signals ({signals.length})
          </h3>
          {loadingSignals ? (
            <div className="text-sm text-slate-400">Loading...</div>
          ) : (
            <SignalTimeline signals={signals} />
          )}
        </div>

        {/* News Feed */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-300 md:mb-4">
            News ({articles.length})
          </h3>
          {loadingArticles ? (
            <div className="text-sm text-slate-400">Loading...</div>
          ) : (
            <NewsFeed articles={articles} />
          )}
        </div>
      </div>
    </div>
  )
}
