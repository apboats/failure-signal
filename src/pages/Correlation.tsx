import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'
import { getRiskLevel } from '../../shared/constants'
import { TrendingDown, TrendingUp, BarChart3 } from 'lucide-react'

interface Snapshot {
  institution_id: string
  snapshot_date: string
  risk_score: number
  stock_price: number | null
  stock_change_pct: number | null
}

interface CorrelationResult {
  institution_id: string
  name: string
  ticker: string
  dataPoints: number
  avgScoreWhenDropped: number
  avgScoreWhenRose: number
  scorePredictedDrop: number // % of times high score preceded stock drop
  totalHighScoreDays: number
  totalDropAfterHighScore: number
}

export function Correlation() {
  const { institutions } = useInstitutions()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selectedInstitution, setSelectedInstitution] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [daysAhead, setDaysAhead] = useState(3) // Look 1, 3, 7 days ahead

  useEffect(() => {
    supabase
      .from('daily_snapshots')
      .select('institution_id, snapshot_date, risk_score, stock_price, stock_change_pct')
      .not('stock_price', 'is', null)
      .order('snapshot_date', { ascending: true })
      .then(({ data }) => {
        setSnapshots(data ?? [])
        setLoading(false)
      })
  }, [])

  const instName = (id: string) => institutions.find((i) => i.id === id)?.name ?? 'Unknown'
  const instTicker = (id: string) => institutions.find((i) => i.id === id)?.ticker ?? ''

  // Group snapshots by institution
  const byInstitution = new Map<string, Snapshot[]>()
  for (const snap of snapshots) {
    const existing = byInstitution.get(snap.institution_id) ?? []
    existing.push(snap)
    byInstitution.set(snap.institution_id, existing)
  }

  // Compute correlation stats for each institution
  const correlations: CorrelationResult[] = []
  for (const [instId, snaps] of byInstitution) {
    if (snaps.length < 3) continue // Need at least 3 data points

    let totalHighScoreDays = 0
    let totalDropAfterHighScore = 0
    let sumScoreWhenDropped = 0
    let countDropped = 0
    let sumScoreWhenRose = 0
    let countRose = 0

    for (let i = 0; i < snaps.length - daysAhead; i++) {
      const current = snaps[i]
      const future = snaps[i + daysAhead]
      if (!current.stock_price || !future?.stock_price) continue

      const priceChange = ((future.stock_price - current.stock_price) / current.stock_price) * 100

      if (priceChange < 0) {
        sumScoreWhenDropped += current.risk_score
        countDropped++
      } else {
        sumScoreWhenRose += current.risk_score
        countRose++
      }

      // "High score" = above 8% (our watch threshold)
      if (current.risk_score >= 8) {
        totalHighScoreDays++
        if (priceChange < 0) {
          totalDropAfterHighScore++
        }
      }
    }

    correlations.push({
      institution_id: instId,
      name: instName(instId),
      ticker: instTicker(instId),
      dataPoints: snaps.length,
      avgScoreWhenDropped: countDropped > 0 ? sumScoreWhenDropped / countDropped : 0,
      avgScoreWhenRose: countRose > 0 ? sumScoreWhenRose / countRose : 0,
      scorePredictedDrop: totalHighScoreDays > 0 ? (totalDropAfterHighScore / totalHighScoreDays) * 100 : 0,
      totalHighScoreDays,
      totalDropAfterHighScore,
    })
  }

  correlations.sort((a, b) => b.dataPoints - a.dataPoints)

  // Chart data for selected institution
  const selectedSnaps = selectedInstitution ? (byInstitution.get(selectedInstitution) ?? []) : []
  const chartData = selectedSnaps.map((snap) => ({
    date: snap.snapshot_date,
    score: snap.risk_score,
    price: snap.stock_price,
  }))

  // Normalize price to percentage for dual-axis display
  const firstPrice = chartData.find((d) => d.price)?.price ?? 1
  const normalizedChartData = chartData.map((d) => ({
    ...d,
    priceNormalized: d.price ? ((d.price / firstPrice) * 100).toFixed(1) : null,
  }))

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Loading correlation data...</div>
  }

  const hasData = correlations.some((c) => c.dataPoints >= 3)

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs text-slate-400 md:text-sm">
          Tracks whether risk score increases predict future stock price declines.
          More data = more reliable correlations. Currently collecting daily snapshots.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
          <BarChart3 className="mx-auto mb-3 h-10 w-10" />
          <p className="text-lg">Not enough data yet</p>
          <p className="mt-2 text-sm">
            Daily snapshots started recording. Need at least 3 days of data per institution
            to start computing correlations. Check back in a few days.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Snapshots recorded: {snapshots.length} across {byInstitution.size} institutions
          </p>
        </div>
      ) : (
        <>
          {/* Lookback selector */}
          <div className="mb-6 flex items-center gap-2">
            <span className="text-xs text-slate-400">Score → Price lag:</span>
            {[1, 3, 7, 14].map((d) => (
              <button
                key={d}
                onClick={() => setDaysAhead(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  daysAhead === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Correlation Table */}
          <div className="mb-8 overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/50">
            <table className="w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-3 py-3 font-medium md:px-4">Institution</th>
                  <th className="px-3 py-3 font-medium md:px-4">Days</th>
                  <th className="px-3 py-3 font-medium md:px-4">Avg Score Before Drop</th>
                  <th className="px-3 py-3 font-medium md:px-4">Avg Score Before Rise</th>
                  <th className="hidden px-3 py-3 font-medium sm:table-cell md:px-4">High Score → Drop %</th>
                </tr>
              </thead>
              <tbody>
                {correlations.filter((c) => c.dataPoints >= 3).map((c) => {
                  const scoreDiff = c.avgScoreWhenDropped - c.avgScoreWhenRose
                  const isCorrelated = scoreDiff > 1 // Higher score preceded drops
                  return (
                    <tr
                      key={c.institution_id}
                      onClick={() => setSelectedInstitution(c.institution_id)}
                      className={`cursor-pointer border-b border-slate-700/50 transition-colors hover:bg-slate-700/30 ${
                        selectedInstitution === c.institution_id ? 'bg-slate-700/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 md:px-4">
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="ml-1.5 text-slate-500">{c.ticker}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 md:px-4">{c.dataPoints}</td>
                      <td className="px-3 py-2.5 md:px-4">
                        <span style={{ color: getRiskLevel(c.avgScoreWhenDropped).color }}>
                          {c.avgScoreWhenDropped.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 md:px-4">
                        <span style={{ color: getRiskLevel(c.avgScoreWhenRose).color }}>
                          {c.avgScoreWhenRose.toFixed(1)}%
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell md:px-4">
                        {c.totalHighScoreDays > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {isCorrelated ? (
                              <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                            ) : (
                              <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                            )}
                            <span className={isCorrelated ? 'text-red-400' : 'text-green-400'}>
                              {c.scorePredictedDrop.toFixed(0)}%
                            </span>
                            <span className="text-slate-600">({c.totalDropAfterHighScore}/{c.totalHighScoreDays})</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Dual-axis chart for selected institution */}
          {selectedInstitution && normalizedChartData.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">
                {instName(selectedInstitution)} ({instTicker(selectedInstitution)}) — Risk Score vs Stock Price
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={normalizedChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} interval="preserveStartEnd" />
                  <YAxis yAxisId="score" domain={[0, 100]} stroke="#3b82f6" fontSize={10} width={35} />
                  <YAxis yAxisId="price" orientation="right" stroke="#22c55e" fontSize={10} width={40}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#f1f5f9' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => {
                      if (name === 'Risk Score') return [`${Number(value).toFixed(1)}%`, name]
                      if (name === 'Stock Price (indexed)') return [`${value}%`, name]
                      return [String(value), name]
                    }}
                  />
                  <Legend />
                  <Line yAxisId="score" type="monotone" dataKey="score" name="Risk Score" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line yAxisId="price" type="monotone" dataKey="priceNormalized" name="Stock Price (indexed)" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[10px] text-slate-500 md:text-xs">
                Blue = Risk Score (left axis, 0-100%). Green = Stock price indexed to first day (right axis).
                If the model works, blue spikes should precede green drops.
              </p>
            </div>
          )}

          {/* Summary stats */}
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">How to Read This</h3>
            <div className="space-y-2 text-xs text-slate-400 md:text-sm">
              <p><strong className="text-slate-300">Avg Score Before Drop</strong> — average risk score on days where the stock price fell {daysAhead} day(s) later. Higher = model is detecting risk before drops.</p>
              <p><strong className="text-slate-300">Avg Score Before Rise</strong> — average risk score on days where the stock price rose {daysAhead} day(s) later. Should be lower than the drop column if the model works.</p>
              <p><strong className="text-slate-300">High Score → Drop %</strong> — when the risk score was above 8% (watch threshold), what percentage of the time did the stock drop {daysAhead} day(s) later? Above 50% suggests predictive power.</p>
              <p className="mt-3 text-slate-500">The model needs weeks of data to show meaningful patterns. Early results will be noisy.</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
