import { format } from 'date-fns'
import { SIGNAL_CATEGORIES } from '../../../shared/constants'
import type { RiskSignal } from '../../../shared/types'

const severityStyles = {
  low: 'border-slate-600',
  medium: 'border-yellow-600',
  high: 'border-orange-600',
  critical: 'border-red-600',
}

export function SignalTimeline({ signals }: { signals: RiskSignal[] }) {
  if (signals.length === 0) {
    return <p className="text-sm text-slate-400">No signals detected yet.</p>
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => {
        const cat = SIGNAL_CATEGORIES[signal.category]
        return (
          <div
            key={signal.id}
            className={`rounded-lg border-l-4 bg-slate-800/50 p-4 ${severityStyles[signal.severity]}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                >
                  {cat.label}
                </span>
                <h4 className="mt-1 text-sm font-medium text-white">{signal.title}</h4>
                {signal.description && (
                  <p className="mt-1 text-xs text-slate-400">{signal.description}</p>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>{format(new Date(signal.signal_date), 'MMM d, yyyy')}</div>
                <div className="mt-1 capitalize">{signal.severity}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
