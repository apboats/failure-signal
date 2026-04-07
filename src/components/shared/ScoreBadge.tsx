import { getRiskLevel } from '../../../shared/constants'

export function ScoreBadge({ score }: { score: number }) {
  const level = getRiskLevel(score)

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${level.color}20`, color: level.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: level.color }}
      />
      {level.label} — {score.toFixed(1)}%
    </span>
  )
}
