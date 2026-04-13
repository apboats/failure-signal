import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp, Eye, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'
import { getRiskLevel } from '../../shared/constants'

interface TradingSignal {
  id: string
  institution_id: string
  signal_type: string
  score_at_signal: number
  score_change: number
  price_at_signal: number | null
  reason: string
  is_active: boolean
  created_at: string
}

interface Snapshot {
  institution_id: string
  snapshot_date: string
  risk_score: number
  stock_price: number | null
  stock_change_pct: number | null
}

const signalConfig: Record<string, { label: string; color: string; icon: typeof TrendingDown; bgClass: string }> = {
  short_entry: { label: 'Short Entry', color: '#ef4444', icon: TrendingDown, bgClass: 'bg-red-950/30 border-red-800' },
  short_exit: { label: 'Close Short', color: '#22c55e', icon: TrendingUp, bgClass: 'bg-green-950/30 border-green-800' },
  long_entry: { label: 'Long Entry', color: '#3b82f6', icon: TrendingUp, bgClass: 'bg-blue-950/30 border-blue-800' },
  long_exit: { label: 'Close Long', color: '#f97316', icon: TrendingDown, bgClass: 'bg-orange-950/30 border-orange-800' },
  watch: { label: 'Watch', color: '#eab308', icon: Eye, bgClass: 'bg-yellow-950/30 border-yellow-800' },
}

export function TradingSignals() {
  const { institutions } = useInstitutions()
  const [signals, setSignals] = useState<TradingSignal[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('trading_signals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('daily_snapshots')
        .select('institution_id, snapshot_date, risk_score, stock_price, stock_change_pct')
        .order('snapshot_date', { ascending: false })
        .limit(500),
    ]).then(([signalsRes, snapshotsRes]) => {
      setSignals(signalsRes.data ?? [])
      setSnapshots(snapshotsRes.data ?? [])
      setLoading(false)
    })
  }, [])

  const instName = (id: string) => institutions.find((i) => i.id === id)?.name ?? 'Unknown'
  const instTicker = (id: string) => institutions.find((i) => i.id === id)?.ticker ?? ''

  // Get latest snapshot per institution
  const latestSnapshots = new Map<string, Snapshot>()
  for (const snap of snapshots) {
    if (!latestSnapshots.has(snap.institution_id)) {
      latestSnapshots.set(snap.institution_id, snap)
    }
  }

  // Top movers: institutions with biggest score changes
  const movers = [...latestSnapshots.entries()]
    .map(([id, snap]) => ({ id, ...snap, name: instName(id), ticker: instTicker(id) }))
    .filter((m) => m.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 10)

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Loading signals...</div>
  }

  return (
    <div>
      {/* Active Signals */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Active Trading Signals</h2>
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
            <p>No active trading signals</p>
            <p className="mt-1 text-xs">Signals generate when risk scores cross thresholds. Data is still accumulating.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => {
              const config = signalConfig[signal.signal_type] ?? signalConfig.watch
              const Icon = config.icon
              return (
                <div
                  key={signal.id}
                  className={`rounded-xl border p-4 md:p-5 ${config.bgClass}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 rounded-lg p-2"
                      style={{ backgroundColor: `${config.color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: config.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded px-2 py-0.5 text-xs font-bold"
                          style={{ backgroundColor: `${config.color}30`, color: config.color }}
                        >
                          {config.label}
                        </span>
                        <Link
                          to={`/institution/${signal.institution_id}`}
                          className="text-sm font-semibold text-white hover:underline"
                        >
                          {instName(signal.institution_id)}
                        </Link>
                        <span className="text-xs text-slate-500">{instTicker(signal.institution_id)}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400 md:text-sm">{signal.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Score: <span className="font-medium" style={{ color: getRiskLevel(signal.score_at_signal).color }}>{signal.score_at_signal.toFixed(1)}%</span></span>
                        {signal.score_change !== 0 && (
                          <span>Change: <span className={signal.score_change > 0 ? 'text-red-400' : 'text-green-400'}>{signal.score_change > 0 ? '+' : ''}{signal.score_change.toFixed(1)}</span></span>
                        )}
                        {signal.price_at_signal && (
                          <span>Price: ${signal.price_at_signal.toFixed(2)}</span>
                        )}
                        <span>{new Date(signal.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Risk Leaderboard */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Highest Risk Scores</h2>
        {movers.length === 0 ? (
          <p className="text-sm text-slate-400">No scored institutions yet. Waiting for data to accumulate.</p>
        ) : (
          <div className="space-y-2">
            {movers.map((m) => {
              const level = getRiskLevel(m.risk_score)
              return (
                <Link
                  key={m.id}
                  to={`/institution/${m.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3 transition-colors hover:border-slate-600 md:p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: `${level.color}20`, color: level.color }}
                    >
                      {m.risk_score.toFixed(0)}%
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">{m.name}</span>
                      {m.ticker && <span className="ml-2 text-xs text-slate-500">{m.ticker}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.stock_price && (
                      <div className="text-right">
                        <div className="text-xs text-slate-400">${m.stock_price.toFixed(2)}</div>
                        {m.stock_change_pct !== null && (
                          <div className={`text-xs font-medium ${m.stock_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {m.stock_change_pct >= 0 ? '+' : ''}{m.stock_change_pct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    )}
                    <ArrowRight className="h-4 w-4 text-slate-600" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
