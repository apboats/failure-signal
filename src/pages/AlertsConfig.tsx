import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useInstitutions } from '../hooks/useInstitutions'
import { SIGNAL_CATEGORIES } from '../../shared/constants'
import type { AlertConfig, SignalCategory } from '../../shared/types'

export function AlertsConfig() {
  const { institutions } = useInstitutions()
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('alert_configs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to fetch alerts:', error)
        else setAlerts(data ?? [])
        setLoading(false)
      })
  }, [])

  const institutionName = (id: string) =>
    institutions.find((i) => i.id === id)?.name ?? 'Unknown'

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading alert configurations...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Configure thresholds and notification preferences for monitored institutions.
        </p>
        <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Alert
        </button>
      </div>

      {alerts.length === 0 ? (
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
              className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 p-6"
            >
              <div>
                <h3 className="font-semibold text-white">{institutionName(alert.institution_id)}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Trigger at <span className="font-medium text-orange-400">{alert.threshold_score}%</span> risk score
                </p>
                {alert.signal_categories && alert.signal_categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.signal_categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300"
                      >
                        {SIGNAL_CATEGORIES[cat as SignalCategory]?.label ?? cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    alert.is_active ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {alert.is_active ? 'Active' : 'Paused'}
                </span>
                <button className="text-slate-500 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
