import { getRiskLevel } from '../../../shared/constants'

export function RiskGauge({ score }: { score: number }) {
  const level = getRiskLevel(score)
  const rotation = (score / 100) * 180 - 90 // -90 to 90 degrees

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="h-20 w-32">
        {/* Background arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          stroke="#334155"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none"
          stroke={level.color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 157} 157`}
        />
        {/* Needle */}
        <line
          x1="60"
          y1="60"
          x2="60"
          y2="20"
          stroke={level.color}
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${rotation}, 60, 60)`}
        />
        <circle cx="60" cy="60" r="3" fill={level.color} />
      </svg>
      <span className="text-2xl font-bold" style={{ color: level.color }}>
        {score.toFixed(1)}%
      </span>
      <span className="text-xs text-slate-400">{level.label} Risk</span>
    </div>
  )
}
