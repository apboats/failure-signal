import type { SignalCategory } from './types'

export const SIGNAL_CATEGORIES: Record<SignalCategory, { label: string; color: string; icon: string }> = {
  stock_drop: { label: 'Stock Drop', color: '#ef4444', icon: 'TrendingDown' },
  cds_spike: { label: 'CDS Spike', color: '#f97316', icon: 'AlertTriangle' },
  liquidity_warning: { label: 'Liquidity Warning', color: '#eab308', icon: 'Droplets' },
  client_withdrawal: { label: 'Client Withdrawal', color: '#a855f7', icon: 'UserMinus' },
  counterparty_action: { label: 'Counterparty Action', color: '#ec4899', icon: 'Shield' },
  regulatory_signal: { label: 'Regulatory Signal', color: '#3b82f6', icon: 'Building2' },
  credit_downgrade: { label: 'Credit Downgrade', color: '#f43f5e', icon: 'ArrowDownCircle' },
  executive_departure: { label: 'Executive Departure', color: '#8b5cf6', icon: 'UserX' },
  news_sentiment: { label: 'News Sentiment', color: '#6b7280', icon: 'Newspaper' },
}

export const DEFAULT_SCORING_WEIGHTS: Record<SignalCategory, number> = {
  cds_spike: 0.20,
  liquidity_warning: 0.20,
  stock_drop: 0.15,
  client_withdrawal: 0.15,
  counterparty_action: 0.10,
  credit_downgrade: 0.08,
  regulatory_signal: 0.07,
  executive_departure: 0.00,
  news_sentiment: 0.05,
}

export const SEVERITY_WEIGHTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
}

export const RISK_LEVELS = [
  { max: 20, label: 'Low', color: '#22c55e' },
  { max: 40, label: 'Elevated', color: '#eab308' },
  { max: 60, label: 'High', color: '#f97316' },
  { max: 80, label: 'Severe', color: '#ef4444' },
  { max: 100, label: 'Critical', color: '#dc2626' },
] as const

export function getRiskLevel(score: number) {
  return RISK_LEVELS.find(l => score <= l.max) ?? RISK_LEVELS[RISK_LEVELS.length - 1]
}
