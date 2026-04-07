import type { SentimentLabel } from '../../../shared/types'

const sentimentConfig: Record<SentimentLabel, { label: string; color: string }> = {
  very_negative: { label: 'Very Negative', color: '#dc2626' },
  negative: { label: 'Negative', color: '#f97316' },
  neutral: { label: 'Neutral', color: '#6b7280' },
  positive: { label: 'Positive', color: '#22c55e' },
  very_positive: { label: 'Very Positive', color: '#16a34a' },
}

export function SentimentTag({ sentiment }: { sentiment: SentimentLabel }) {
  const config = sentimentConfig[sentiment]

  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${config.color}20`, color: config.color }}
    >
      {config.label}
    </span>
  )
}
