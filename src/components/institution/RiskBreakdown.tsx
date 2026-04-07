import { SIGNAL_CATEGORIES } from '../../../shared/constants'
import type { SignalCategory } from '../../../shared/types'

interface Props {
  components: Record<SignalCategory, number>
}

export function RiskBreakdown({ components }: Props) {
  const entries = Object.entries(components)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)

  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No risk breakdown available.</p>
  }

  const maxValue = Math.max(...entries.map(([, v]) => v))

  return (
    <div className="space-y-3">
      {entries.map(([category, value]) => {
        const cat = SIGNAL_CATEGORIES[category as SignalCategory]
        const pct = (value / maxValue) * 100
        return (
          <div key={category}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span style={{ color: cat.color }}>{cat.label}</span>
              <span className="text-slate-400">{value.toFixed(1)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: cat.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
