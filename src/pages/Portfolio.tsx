import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'
import { getRiskLevel } from '../../shared/constants'

interface Position {
  id: string
  institution_id: string
  direction: string
  entry_price: number
  entry_date: string
  entry_score: number | null
  exit_price: number | null
  exit_date: string | null
  exit_score: number | null
  shares: number
  notes: string | null
  is_open: boolean
  created_at: string
}

export function Portfolio() {
  const { institutions } = useInstitutions()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState<string | null>(null)

  // Form state
  const [formInstitutionId, setFormInstitutionId] = useState('')
  const [formDirection, setFormDirection] = useState<'short' | 'long'>('short')
  const [formPrice, setFormPrice] = useState('')
  const [formShares, setFormShares] = useState('100')
  const [formNotes, setFormNotes] = useState('')
  const [closePrice, setClosePrice] = useState('')

  const fetchPositions = () => {
    supabase
      .from('positions')
      .select('*')
      .order('is_open', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPositions(data ?? [])
        setLoading(false)
      })
  }

  useEffect(() => { fetchPositions() }, [])

  const instName = (id: string) => institutions.find((i) => i.id === id)?.name ?? 'Unknown'
  const instTicker = (id: string) => institutions.find((i) => i.id === id)?.ticker ?? ''

  const handleOpen = async () => {
    if (!formInstitutionId || !formPrice) return

    // Get current risk score
    const { data: score } = await supabase
      .from('risk_scores')
      .select('score')
      .eq('institution_id', formInstitutionId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()

    await supabase.from('positions').insert({
      institution_id: formInstitutionId,
      direction: formDirection,
      entry_price: parseFloat(formPrice),
      entry_date: new Date().toISOString().split('T')[0],
      entry_score: score ? Number(score.score) : null,
      shares: parseFloat(formShares),
      notes: formNotes || null,
    })

    setShowForm(false)
    setFormInstitutionId('')
    setFormPrice('')
    setFormShares('100')
    setFormNotes('')
    fetchPositions()
  }

  const handleClose = async (positionId: string) => {
    if (!closePrice) return

    const position = positions.find((p) => p.id === positionId)
    if (!position) return

    const { data: score } = await supabase
      .from('risk_scores')
      .select('score')
      .eq('institution_id', position.institution_id)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()

    await supabase
      .from('positions')
      .update({
        exit_price: parseFloat(closePrice),
        exit_date: new Date().toISOString().split('T')[0],
        exit_score: score ? Number(score.score) : null,
        is_open: false,
      })
      .eq('id', positionId)

    setShowCloseForm(null)
    setClosePrice('')
    fetchPositions()
  }

  const openPositions = positions.filter((p) => p.is_open)
  const closedPositions = positions.filter((p) => !p.is_open)

  // Calculate P&L for closed positions
  const totalPnl = closedPositions.reduce((sum, p) => {
    if (!p.exit_price) return sum
    const pnl = p.direction === 'short'
      ? (p.entry_price - p.exit_price) * p.shares
      : (p.exit_price - p.entry_price) * p.shares
    return sum + pnl
  }, 0)

  const winRate = closedPositions.length > 0
    ? (closedPositions.filter((p) => {
        if (!p.exit_price) return false
        return p.direction === 'short'
          ? p.exit_price < p.entry_price
          : p.exit_price > p.entry_price
      }).length / closedPositions.length * 100)
    : 0

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Loading positions...</div>
  }

  return (
    <div>
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 md:p-4">
          <div className="text-xs text-slate-400">Open Positions</div>
          <div className="mt-1 text-xl font-bold text-white">{openPositions.length}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 md:p-4">
          <div className="text-xs text-slate-400">Closed</div>
          <div className="mt-1 text-xl font-bold text-white">{closedPositions.length}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 md:p-4">
          <div className="text-xs text-slate-400">Total P&L</div>
          <div className={`mt-1 text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 md:p-4">
          <div className="text-xs text-slate-400">Win Rate</div>
          <div className="mt-1 text-xl font-bold text-white">{winRate.toFixed(0)}%</div>
        </div>
      </div>

      {/* New Position Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Open Positions</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 md:text-sm"
          >
            <Plus className="h-4 w-4" /> New Position
          </button>
        )}
      </div>

      {/* New Position Form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-blue-800 bg-slate-800/80 p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Open Position</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Institution</label>
              <select
                value={formInstitutionId}
                onChange={(e) => setFormInstitutionId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Select...</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} {inst.ticker ? `(${inst.ticker})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Direction</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormDirection('short')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    formDirection === 'short' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Short
                </button>
                <button
                  onClick={() => setFormDirection('long')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    formDirection === 'long' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Long
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Entry Price</label>
              <input
                type="number"
                step="0.01"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Shares</label>
              <input
                type="number"
                value={formShares}
                onChange={(e) => setFormShares(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-400">Notes (optional)</label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Why this trade..."
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400">Cancel</button>
            <button
              onClick={handleOpen}
              disabled={!formInstitutionId || !formPrice}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Open Position
            </button>
          </div>
        </div>
      )}

      {/* Open Positions */}
      {openPositions.length === 0 && !showForm ? (
        <div className="mb-8 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
          <DollarSign className="mx-auto mb-2 h-8 w-8" />
          <p>No open positions</p>
          <p className="mt-1 text-xs">Use trading signals to identify entries.</p>
        </div>
      ) : (
        <div className="mb-8 space-y-2">
          {openPositions.map((pos) => (
            <div key={pos.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                      pos.direction === 'short' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                    }`}>
                      {pos.direction === 'short' ? <TrendingDown className="mr-1 inline h-3 w-3" /> : <TrendingUp className="mr-1 inline h-3 w-3" />}
                      {pos.direction.toUpperCase()}
                    </span>
                    <Link to={`/institution/${pos.institution_id}`} className="text-sm font-semibold text-white hover:underline">
                      {instName(pos.institution_id)}
                    </Link>
                    <span className="text-xs text-slate-500">{instTicker(pos.institution_id)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Entry: ${pos.entry_price.toFixed(2)}</span>
                    <span>{pos.shares} shares</span>
                    <span>{pos.entry_date}</span>
                    {pos.entry_score !== null && (
                      <span>Score at entry: <span style={{ color: getRiskLevel(pos.entry_score).color }}>{pos.entry_score.toFixed(1)}%</span></span>
                    )}
                  </div>
                  {pos.notes && <p className="mt-1 text-xs text-slate-500">{pos.notes}</p>}
                </div>
                {showCloseForm === pos.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={closePrice}
                      onChange={(e) => setClosePrice(e.target.value)}
                      placeholder="Exit price"
                      className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                    <button onClick={() => handleClose(pos.id)} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Close</button>
                    <button onClick={() => setShowCloseForm(null)} className="text-xs text-slate-400">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCloseForm(pos.id)}
                    className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
                  >
                    Close Position
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Closed Positions */}
      {closedPositions.length > 0 && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Closed Positions</h2>
          <div className="space-y-2">
            {closedPositions.map((pos) => {
              const pnl = pos.exit_price
                ? pos.direction === 'short'
                  ? (pos.entry_price - pos.exit_price) * pos.shares
                  : (pos.exit_price - pos.entry_price) * pos.shares
                : 0
              const pnlPct = pos.exit_price
                ? ((pos.direction === 'short' ? pos.entry_price - pos.exit_price : pos.exit_price - pos.entry_price) / pos.entry_price) * 100
                : 0
              return (
                <div key={pos.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          pos.direction === 'short' ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'
                        }`}>
                          {pos.direction.toUpperCase()}
                        </span>
                        <span className="text-sm text-slate-300">{instName(pos.institution_id)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>${pos.entry_price.toFixed(2)} → ${pos.exit_price?.toFixed(2)}</span>
                        <span>{pos.entry_date} → {pos.exit_date}</span>
                      </div>
                    </div>
                    <div className={`text-right text-sm font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      <div>{pnl >= 0 ? '+' : ''}{pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</div>
                      <div className="text-xs">{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
