import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { RiskGauge } from './RiskGauge'
import { ScoreBadge } from '../shared/ScoreBadge'
import type { Institution, RiskScore, RiskSignal } from '../../../shared/types'

interface Props {
  institution: Institution
  latestScore: RiskScore | null
  recentSignals: RiskSignal[]
}

export function InstitutionCard({ institution, latestScore, recentSignals }: Props) {
  const score = latestScore?.score ?? 0

  return (
    <Link
      to={`/institution/${institution.id}`}
      className="group flex flex-col rounded-xl border border-slate-700 bg-slate-800/50 p-6 transition-all hover:border-slate-600 hover:bg-slate-800"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{institution.name}</h3>
          {institution.ticker && (
            <span className="text-sm text-slate-400">{institution.ticker}</span>
          )}
        </div>
        <ScoreBadge score={score} />
      </div>

      <RiskGauge score={score} />

      <div className="mt-4 border-t border-slate-700 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            {recentSignals.length} signal{recentSignals.length !== 1 ? 's' : ''} (7d)
          </span>
          <span className="flex items-center gap-1 text-slate-400 group-hover:text-white">
            Details <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}
