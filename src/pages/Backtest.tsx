import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingDown, TrendingUp, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'

type EventDef =
  | { kind: 'level'; threshold: number }
  | { kind: 'velocity'; deltaThreshold: number; windowDays: number }

interface Snapshot {
  institution_id: string
  snapshot_date: string
  risk_score: number
  stock_price: number | null
}

interface Benchmark {
  ticker: string
  snapshot_date: string
  price: number
}

interface EventResult {
  institution_id: string
  institution_name: string
  ticker: string
  event_date: string
  score_at_event: number
  prior_score: number
  excess_returns: Record<number, number | null> // day -> excess return %
  raw_returns: Record<number, number | null>
}

const HORIZONS = [1, 3, 5, 10, 20]

export function Backtest() {
  const { institutions } = useInstitutions()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [loading, setLoading] = useState(true)

  // Event configuration
  const [eventKind, setEventKind] = useState<'level' | 'velocity'>('level')
  const [levelThreshold, setLevelThreshold] = useState(8)
  const [velocityDelta, setVelocityDelta] = useState(3)
  const [velocityWindow, setVelocityWindow] = useState(7)
  const [benchmarkTicker, setBenchmarkTicker] = useState<'XLF' | 'SPY'>('XLF')

  useEffect(() => {
    Promise.all([
      supabase
        .from('daily_snapshots')
        .select('institution_id, snapshot_date, risk_score, stock_price')
        .not('stock_price', 'is', null)
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('benchmark_snapshots')
        .select('ticker, snapshot_date, price')
        .order('snapshot_date', { ascending: true }),
    ]).then(([s, b]) => {
      setSnapshots(s.data ?? [])
      setBenchmarks(b.data ?? [])
      setLoading(false)
    })
  }, [])

  const eventDef: EventDef = eventKind === 'level'
    ? { kind: 'level', threshold: levelThreshold }
    : { kind: 'velocity', deltaThreshold: velocityDelta, windowDays: velocityWindow }

  // Build benchmark price lookup
  const benchByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of benchmarks) {
      if (b.ticker === benchmarkTicker && b.price) {
        map.set(b.snapshot_date, Number(b.price))
      }
    }
    return map
  }, [benchmarks, benchmarkTicker])

  // Identify events and compute returns
  const events: EventResult[] = useMemo(() => {
    if (snapshots.length === 0) return []

    // Group snapshots by institution
    const byInst = new Map<string, Snapshot[]>()
    for (const s of snapshots) {
      const existing = byInst.get(s.institution_id) ?? []
      existing.push(s)
      byInst.set(s.institution_id, existing)
    }

    const results: EventResult[] = []

    for (const [instId, snaps] of byInst) {
      snaps.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      const inst = institutions.find((i) => i.id === instId)
      if (!inst || !inst.ticker) continue

      for (let i = 0; i < snaps.length; i++) {
        const current = snaps[i]
        if (current.stock_price == null) continue

        // Check event criteria
        let isEvent = false
        let priorScore = 0

        if (eventDef.kind === 'level') {
          if (Number(current.risk_score) < eventDef.threshold) continue
          // Only fire on the first day score crosses above (not every day above)
          const prev = i > 0 ? snaps[i - 1] : null
          if (prev && Number(prev.risk_score) >= eventDef.threshold) continue
          isEvent = true
          priorScore = prev ? Number(prev.risk_score) : 0
        } else {
          // Velocity: score rose by deltaThreshold over windowDays
          const lookback = i - eventDef.windowDays
          if (lookback < 0) continue
          const past = snaps[lookback]
          const delta = Number(current.risk_score) - Number(past.risk_score)
          if (delta < eventDef.deltaThreshold) continue
          isEvent = true
          priorScore = Number(past.risk_score)
        }

        if (!isEvent) continue

        // Compute returns at each horizon
        const excessReturns: Record<number, number | null> = {}
        const rawReturns: Record<number, number | null> = {}
        const benchAtEvent = benchByDate.get(current.snapshot_date)

        for (const horizon of HORIZONS) {
          const futureIdx = i + horizon
          if (futureIdx >= snaps.length) {
            excessReturns[horizon] = null
            rawReturns[horizon] = null
            continue
          }

          const future = snaps[futureIdx]
          if (future.stock_price == null || current.stock_price == null) {
            excessReturns[horizon] = null
            rawReturns[horizon] = null
            continue
          }

          const stockReturn = ((future.stock_price - current.stock_price) / current.stock_price) * 100
          rawReturns[horizon] = stockReturn

          const benchAtFuture = benchByDate.get(future.snapshot_date)
          if (benchAtEvent && benchAtFuture) {
            const benchReturn = ((benchAtFuture - benchAtEvent) / benchAtEvent) * 100
            excessReturns[horizon] = stockReturn - benchReturn
          } else {
            excessReturns[horizon] = null
          }
        }

        results.push({
          institution_id: instId,
          institution_name: inst.name,
          ticker: inst.ticker,
          event_date: current.snapshot_date,
          score_at_event: Number(current.risk_score),
          prior_score: priorScore,
          excess_returns: excessReturns,
          raw_returns: rawReturns,
        })
      }
    }

    return results
  }, [snapshots, institutions, eventDef, benchByDate])

  // Aggregate stats per horizon
  const stats = useMemo(() => {
    const byHorizon: Record<number, {
      count: number
      avgExcess: number
      avgRaw: number
      hitRate: number
      maxLoss: number
      median: number
    }> = {}

    for (const horizon of HORIZONS) {
      const excess = events.map((e) => e.excess_returns[horizon]).filter((v): v is number => v != null)
      const raw = events.map((e) => e.raw_returns[horizon]).filter((v): v is number => v != null)

      if (excess.length === 0) {
        byHorizon[horizon] = { count: 0, avgExcess: 0, avgRaw: 0, hitRate: 0, maxLoss: 0, median: 0 }
        continue
      }

      const sorted = [...excess].sort((a, b) => a - b)
      byHorizon[horizon] = {
        count: excess.length,
        avgExcess: excess.reduce((a, b) => a + b, 0) / excess.length,
        avgRaw: raw.reduce((a, b) => a + b, 0) / raw.length,
        hitRate: (excess.filter((v) => v < 0).length / excess.length) * 100,
        maxLoss: Math.min(...excess),
        median: sorted[Math.floor(sorted.length / 2)],
      }
    }

    return byHorizon
  }, [events])

  // Chart data for cumulative excess return distribution
  const chartData = HORIZONS.map((h) => ({
    horizon: `${h}d`,
    avgExcess: stats[h]?.avgExcess ?? 0,
    median: stats[h]?.median ?? 0,
  }))

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Loading backtest data...</div>
  }

  const hasEnoughData = events.length >= 5
  const isPredictive = stats[5]?.hitRate > 55 || stats[5]?.avgExcess < -1

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-slate-400 md:text-sm">
          Event study methodology: when the risk score meets your event criteria,
          measure the bank's stock return vs <strong className="text-white">{benchmarkTicker}</strong> over
          the next N days. Aggregates across all banks and dates. This filters out market noise
          and isolates the bank-specific effect of the score.
        </p>
      </div>

      {/* Event Configuration */}
      <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Event Definition</h3>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setEventKind('level')}
            className={`rounded-lg px-3 py-2 text-xs font-medium md:text-sm ${
              eventKind === 'level' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            Score Level
          </button>
          <button
            onClick={() => setEventKind('velocity')}
            className={`rounded-lg px-3 py-2 text-xs font-medium md:text-sm ${
              eventKind === 'velocity' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            Score Velocity
          </button>
        </div>

        {eventKind === 'level' ? (
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Trigger when score crosses above {levelThreshold}%
            </label>
            <input
              type="range"
              min={3}
              max={50}
              step={1}
              value={levelThreshold}
              onChange={(e) => setLevelThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-slate-500">
              Only fires on the day the score first crosses this level (not every day above).
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Score rose by {velocityDelta}+ points
              </label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={velocityDelta}
                onChange={(e) => setVelocityDelta(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Over the past {velocityWindow} days
              </label>
              <input
                type="range"
                min={2}
                max={30}
                step={1}
                value={velocityWindow}
                onChange={(e) => setVelocityWindow(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <span className="text-xs text-slate-400">Benchmark:</span>
          {(['XLF', 'SPY'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setBenchmarkTicker(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                benchmarkTicker === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {!hasEnoughData ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
          <AlertCircle className="mx-auto mb-3 h-10 w-10" />
          <p className="text-lg text-white">Not enough events yet</p>
          <p className="mt-2 text-sm">
            Found <strong>{events.length}</strong> events matching this criteria.
            Need at least 5 events for meaningful statistics.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Try lowering the threshold or wait for more data to accumulate.
          </p>
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className={`mb-6 rounded-xl border p-4 md:p-6 ${
            isPredictive ? 'border-green-700 bg-green-950/30' : 'border-yellow-700 bg-yellow-950/30'
          }`}>
            <h3 className={`text-sm font-semibold ${isPredictive ? 'text-green-400' : 'text-yellow-400'}`}>
              {isPredictive ? 'Signal shows predictive value' : 'Signal does not yet show predictive value'}
            </h3>
            <p className="mt-2 text-xs text-slate-300 md:text-sm">
              Based on <strong>{events.length} historical events</strong>: average excess return at 5 days is{' '}
              <strong className={stats[5]?.avgExcess < 0 ? 'text-red-400' : 'text-green-400'}>
                {stats[5]?.avgExcess.toFixed(2)}%
              </strong>{' '}
              vs {benchmarkTicker}.
              When the event triggered, the bank underperformed the benchmark{' '}
              <strong>{stats[5]?.hitRate.toFixed(0)}%</strong> of the time over the next 5 days.
              {isPredictive && ' This suggests the model has real predictive value.'}
              {!isPredictive && ' Random/noise would be ~50%; need >55% hit rate or <-1% avg excess return for a tradable signal.'}
            </p>
          </div>

          {/* Stats Table */}
          <div className="mb-6 overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/50">
            <table className="w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-3 py-3 font-medium md:px-4">Horizon</th>
                  <th className="px-3 py-3 font-medium md:px-4">Events</th>
                  <th className="px-3 py-3 font-medium md:px-4">Avg Excess Return</th>
                  <th className="px-3 py-3 font-medium md:px-4">Median</th>
                  <th className="px-3 py-3 font-medium md:px-4">Hit Rate (drop)</th>
                  <th className="hidden px-3 py-3 font-medium sm:table-cell md:px-4">Max Loss</th>
                </tr>
              </thead>
              <tbody>
                {HORIZONS.map((h) => {
                  const s = stats[h]
                  if (!s || s.count === 0) {
                    return (
                      <tr key={h} className="border-b border-slate-700/50">
                        <td className="px-3 py-2.5 font-medium text-slate-300 md:px-4">{h}d</td>
                        <td className="px-3 py-2.5 text-slate-600 md:px-4" colSpan={5}>Insufficient data</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={h} className="border-b border-slate-700/50">
                      <td className="px-3 py-2.5 font-medium text-white md:px-4">{h}d</td>
                      <td className="px-3 py-2.5 text-slate-400 md:px-4">{s.count}</td>
                      <td className="px-3 py-2.5 md:px-4">
                        <span className={s.avgExcess < 0 ? 'text-red-400' : 'text-green-400'}>
                          {s.avgExcess >= 0 ? '+' : ''}{s.avgExcess.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 md:px-4">
                        <span className={s.median < 0 ? 'text-red-400' : 'text-green-400'}>
                          {s.median >= 0 ? '+' : ''}{s.median.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 md:px-4">
                        <div className="flex items-center gap-1.5">
                          {s.hitRate > 55 ? <TrendingDown className="h-3.5 w-3.5 text-red-400" /> :
                           s.hitRate < 45 ? <TrendingUp className="h-3.5 w-3.5 text-green-400" /> : null}
                          <span className={s.hitRate > 55 ? 'text-red-400' : s.hitRate < 45 ? 'text-green-400' : 'text-slate-300'}>
                            {s.hitRate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-red-400 sm:table-cell md:px-4">
                        {s.maxLoss.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Excess Return Chart */}
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">Excess Return vs {benchmarkTicker} by Horizon</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="horizon" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#f1f5f9' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => `${Number(value).toFixed(2)}%`}
                />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="avgExcess" stroke="#3b82f6" strokeWidth={2} name="Avg Excess Return" />
                <Line type="monotone" dataKey="median" stroke="#a855f7" strokeWidth={2} name="Median" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-slate-500">
              Negative excess return = the flagged bank underperformed the benchmark, which is what a working
              risk signal should produce. Lines below zero are good for short positions.
            </p>
          </div>

          {/* Event List */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50">
            <div className="border-b border-slate-700 px-4 py-3 md:px-6">
              <h3 className="text-sm font-semibold text-white">Events Found ({events.length})</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-3 py-2 font-medium md:px-4">Date</th>
                    <th className="px-3 py-2 font-medium md:px-4">Bank</th>
                    <th className="px-3 py-2 font-medium md:px-4">Score</th>
                    <th className="px-3 py-2 font-medium md:px-4">5d</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell md:px-4">10d</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell md:px-4">20d</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice().reverse().map((e, idx) => (
                    <tr key={idx} className="border-b border-slate-700/30">
                      <td className="px-3 py-2 text-slate-400 md:px-4">{e.event_date}</td>
                      <td className="px-3 py-2 md:px-4">
                        <span className="font-medium text-white">{e.ticker}</span>
                        <span className="ml-1.5 text-slate-500">{e.institution_name.slice(0, 20)}</span>
                      </td>
                      <td className="px-3 py-2 md:px-4">
                        <span className="text-orange-400">{e.score_at_event.toFixed(1)}%</span>
                      </td>
                      {[5, 10, 20].map((h) => {
                        const r = e.excess_returns[h]
                        const cls = h === 10 ? 'hidden sm:table-cell' : h === 20 ? 'hidden md:table-cell' : ''
                        return (
                          <td key={h} className={`px-3 py-2 md:px-4 ${cls}`}>
                            {r != null ? (
                              <span className={r < 0 ? 'text-red-400' : 'text-green-400'}>
                                {r >= 0 ? '+' : ''}{r.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
