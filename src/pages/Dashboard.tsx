import { useInstitutions } from '../hooks/useInstitutions'
import { useLatestScores } from '../hooks/useRiskScores'
import { useRecentSignals } from '../hooks/useSignals'
import { InstitutionCard } from '../components/dashboard/InstitutionCard'

export function Dashboard() {
  const { institutions, loading: loadingInst } = useInstitutions()
  const { scores, loading: loadingScores } = useLatestScores()
  const { signalsByInstitution, loading: loadingSignals } = useRecentSignals()

  const loading = loadingInst || loadingScores || loadingSignals

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading institutions...
      </div>
    )
  }

  if (institutions.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-slate-400">
        <p className="text-lg">No institutions being monitored</p>
        <p className="mt-2 text-sm">Add institutions via the Supabase dashboard to get started.</p>
      </div>
    )
  }

  const sorted = [...institutions].sort((a, b) => {
    const scoreA = scores[a.id]?.score ?? 0
    const scoreB = scores[b.id]?.score ?? 0
    return scoreB - scoreA
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Monitoring {institutions.length} institution{institutions.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((inst) => (
          <InstitutionCard
            key={inst.id}
            institution={inst}
            latestScore={scores[inst.id] ?? null}
            recentSignals={signalsByInstitution[inst.id] ?? []}
          />
        ))}
      </div>
    </div>
  )
}
