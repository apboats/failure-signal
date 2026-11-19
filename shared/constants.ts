import type {
  RiskToken,
  SentimentLabel,
  SeverityToken,
  SignalCategory,
  SignalSeverity,
  Tone,
  TradingSignalType,
} from './types'
import { SEVERE, SHORT_ENTRY, SHORT_EXIT, WATCH } from './thresholds'

/**
 * Signal categories. `color` is only ever a small dot/accent next to the label
 * (never a row background); see the design spec colour rule.
 */
export const SIGNAL_CATEGORIES: Record<
  SignalCategory,
  { label: string; color: string }
> = {
  stock_drop: { label: 'Stock drop', color: '#ef4444' },
  cds_spike: { label: 'CDS spike', color: '#f97316' },
  liquidity_warning: { label: 'Liquidity warning', color: '#eab308' },
  client_withdrawal: { label: 'Client withdrawal', color: '#a855f7' },
  counterparty_action: { label: 'Counterparty action', color: '#ec4899' },
  regulatory_signal: { label: 'Regulatory signal', color: '#3b82f6' },
  credit_downgrade: { label: 'Credit downgrade', color: '#f43f5e' },
  executive_departure: { label: 'Executive departure', color: '#8b5cf6' },
  news_sentiment: { label: 'News sentiment', color: '#6b7280' },
  insider_selling: { label: 'Insider selling', color: '#f59e0b' },
  peer_contagion: { label: 'Peer contagion', color: '#06b6d4' },
  social_panic: { label: 'Social panic', color: '#e879f9' },
  lawmaker_selling: { label: 'Lawmaker selling', color: '#dc2626' },
}

/** Signal severity -> label, Badge tone and sort rank (higher = worse). */
export const SEVERITY_LEVELS: Record<
  SignalSeverity,
  { label: string; tone: SeverityToken; rank: number }
> = {
  low: { label: 'Low', tone: 'sev-low', rank: 0 },
  medium: { label: 'Medium', tone: 'sev-medium', rank: 1 },
  high: { label: 'High', tone: 'sev-high', rank: 2 },
  critical: { label: 'Critical', tone: 'sev-critical', rank: 3 },
}

/**
 * News sentiment -> label and Badge tone. Sentiment is the sign of
 * sentiment_score, i.e. a valence, which is why it uses the pos/neg tones.
 */
export const SENTIMENT_LEVELS: Record<
  SentimentLabel,
  { label: string; tone: Tone }
> = {
  very_negative: { label: 'Very negative', tone: 'neg' },
  negative: { label: 'Negative', tone: 'neg' },
  neutral: { label: 'Neutral', tone: 'neutral' },
  positive: { label: 'Positive', tone: 'pos' },
  very_positive: { label: 'Very positive', tone: 'pos' },
}

/** Trading signal type -> label and Badge tone (accent/neutral only, never red/green). */
export const TRADING_SIGNAL_TYPES: Record<
  TradingSignalType,
  { label: string; tone: Tone }
> = {
  short_entry: { label: 'Short entry', tone: 'accent' },
  short_exit: { label: 'Short exit', tone: 'neutral' },
  watch: { label: 'Watch', tone: 'neutral' },
}

/** Upper bound of the score index (compute-risk-score clamps to 100). */
export const SCORE_MAX = 100

export type RiskLevelLabel =
  'Low' | 'Guarded' | 'Elevated' | 'High' | 'Critical'

export interface RiskLevel {
  label: RiskLevelLabel
  /** Inclusive lower bound. */
  min: number
  /** Exclusive upper bound (the last band is closed at SCORE_MAX). */
  max: number
  /** sRGB hex of the matching --color-risk-N token (Tailwind 4 oklch, gamut-mapped). Charts and legacy inline styles only. */
  color: string
  /** Token name for the Badge / text-risk-N utilities. */
  token: RiskToken
}

/**
 * The five risk bands, derived from shared/thresholds.ts:
 * Low [0, SHORT_EXIT) · Guarded [SHORT_EXIT, WATCH) · Elevated [WATCH, SHORT_ENTRY)
 * · High [SHORT_ENTRY, SEVERE) · Critical [SEVERE, SCORE_MAX].
 */
export const RISK_LEVELS: readonly RiskLevel[] = [
  { label: 'Low', min: 0, max: SHORT_EXIT, color: '#00d492', token: 'risk-1' }, // emerald-400
  {
    label: 'Guarded',
    min: SHORT_EXIT,
    max: WATCH,
    color: '#ffba00',
    token: 'risk-2',
  }, // amber-400
  {
    label: 'Elevated',
    min: WATCH,
    max: SHORT_ENTRY,
    color: '#ff8904',
    token: 'risk-3',
  }, // orange-400
  {
    label: 'High',
    min: SHORT_ENTRY,
    max: SEVERE,
    color: '#ff6467',
    token: 'risk-4',
  }, // red-400
  {
    label: 'Critical',
    min: SEVERE,
    max: SCORE_MAX,
    color: '#ff2056',
    token: 'risk-5',
  }, // rose-500
]

/**
 * Band for a score using half-open intervals (score < max), so exactly 5 is
 * Guarded, exactly 8 Elevated, 15 High, 25 Critical. Anything at or above the
 * last edge (including scores past SCORE_MAX) is Critical. NaN is treated as 0.
 */
export function getRiskLevel(score: number): RiskLevel {
  const s = Number.isNaN(score) ? 0 : score
  return (
    RISK_LEVELS.find((level) => s < level.max) ??
    RISK_LEVELS[RISK_LEVELS.length - 1]
  )
}
