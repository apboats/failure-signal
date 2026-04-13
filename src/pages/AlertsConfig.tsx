import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, X, Power } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'
import { SIGNAL_CATEGORIES, getRiskLevel } from '../../shared/constants'
import type { AlertConfig, AlertHistory, SignalCategory } from '../../shared/types'

export function AlertsConfig() {
  const { institutions } = useInstitutions()
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [history, setHistory] = useState<AlertHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formInstitutionId, setFormInstitutionId] = useState('')
  const [formThreshold, setFormThreshold] = useState(50)
  const [formCategories, setFormCategories] = useState<SignalCategory[]>([])
  const [saving, setSaving] = useState(false)

  const fetchAlerts = () => {
    supabase
      .from('alert_configs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch alerts:', error)
        else setAlerts(data ?? [])
        setLoading(false)
      })
  }

  const fetchHistory = () => {
    supabase
      .from('alert_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!error) setHistory(data ?? [])
      })
  }

  useEffect(() => {
    fetchAlerts()
    fetchHistory()
  }, [])

  const institutionName = (id: string) =>
    institutions.find((i) => i.id === id)?.name ?? 'Unknown'

  const handleCreate = async () => {
    if (!formInstitutionId) return
    setSaving(true)

    const { error } = await supabase.from('alert_configs').insert({
      institution_id: formInstitutionId,
      threshold_score: formThreshold,
      signal_categories: formCategories.length > 0 ? formCategories : null,
      notify_email: true,
      notify_in_app: true,
      is_active: true,
    })

    if (error) {
      console.error('Failed to create alert:', error)
    } else {
      setShowForm(false)
      setFormInstitutionId('')
      setFormThreshold(50)
      setFormCategories([])
      fetchAlerts()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('alert_configs').delete().eq('id', id)
    if (!error) setAlerts(alerts.filter((a) => a.id !== id))
  }

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    const { error } = await supabase
      .from('alert_configs')
      .update({ is_active: !currentlyActive })
      .eq('id', id)
    if (!error) {
      setAlerts(alerts.map((a) => (a.id === id ? { ...a, is_active: !currentlyActive } : a)))
    }
  }

  const toggleCategory = (cat: SignalCategory) => {
    setFormCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading alert configurations...
      </div>
    )
  }

  const thresholdLevel = getRiskLevel(formThreshold)

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          Get notified when an institution's risk score crosses your threshold.
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New Alert
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-blue-800 bg-slate-800/80 p-4 md:mb-6 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">New Alert</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Institution Select */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Institution</label>
              <select
                value={formInstitutionId}
                onChange={(e) => setFormInstitutionId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select an institution...</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} {inst.ticker ? `(${inst.ticker})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold Slider */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Risk Score Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={5}
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(Number(e.target.value))}
                  className="flex-1"
                />
                <span
                  className="w-20 rounded-lg px-3 py-1 text-center text-sm font-bold"
                  style={{ backgroundColor: `${thresholdLevel.color}20`, color: thresholdLevel.color }}
                >
                  {formThreshold}%
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Alert fires when risk score reaches {formThreshold}% ({thresholdLevel.label})
              </p>
            </div>

            {/* Signal Category Filter */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-400">
                Signal Categories <span className="text-slate-600">(optional — leave empty for all)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SIGNAL_CATEGORIES).map(([key, val]) => {
                  const cat = key as SignalCategory
                  const selected = formCategories.includes(cat)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleCategory(cat)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'ring-1 ring-offset-1 ring-offset-slate-800'
                          : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: `${val.color}${selected ? '30' : '15'}`,
                        color: val.color,
                        ...(selected ? { ringColor: val.color } : {}),
                      }}
                    >
                      {val.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formInstitutionId || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert List */}
      {alerts.length === 0 && !showForm ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-400">
          <Bell className="mb-2 h-8 w-8" />
          <p>No alert configurations yet</p>
          <p className="mt-1 text-sm">Create one to start monitoring risk thresholds.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-center justify-between gap-3 rounded-xl border bg-slate-800/50 p-4 md:p-6 ${
                alert.is_active ? 'border-slate-700' : 'border-slate-800 opacity-60'
              }`}
            >
              <div>
                <h3 className="font-semibold text-white">{institutionName(alert.institution_id)}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Trigger at{' '}
                  <span
                    className="font-medium"
                    style={{ color: getRiskLevel(Number(alert.threshold_score)).color }}
                  >
                    {alert.threshold_score}%
                  </span>{' '}
                  risk score
                </p>
                {alert.signal_categories && alert.signal_categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.signal_categories.map((cat) => {
                      const config = SIGNAL_CATEGORIES[cat as SignalCategory]
                      return (
                        <span
                          key={cat}
                          className="rounded px-2 py-0.5 text-xs"
                          style={{ backgroundColor: `${config?.color ?? '#6b7280'}15`, color: config?.color ?? '#6b7280' }}
                        >
                          {config?.label ?? cat}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(alert.id, alert.is_active)}
                  className={`rounded-lg p-2 ${
                    alert.is_active
                      ? 'text-green-400 hover:bg-green-900/30'
                      : 'text-slate-500 hover:bg-slate-700'
                  }`}
                  title={alert.is_active ? 'Pause alert' : 'Activate alert'}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-900/30 hover:text-red-400"
                  title="Delete alert"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alert History */}
      {history.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">Recent Alert History</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-white">{institutionName(h.institution_id)}</p>
                  <p className="text-xs text-slate-400">{h.trigger_reason}</p>
                </div>
                <div className="text-right">
                  <span
                    className="text-sm font-bold"
                    style={{ color: getRiskLevel(Number(h.triggered_score)).color }}
                  >
                    {Number(h.triggered_score).toFixed(1)}%
                  </span>
                  <p className="text-xs text-slate-500">
                    {new Date(h.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
