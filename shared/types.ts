/**
 * Domain row types. Every table/view shape is derived from the hand-written
 * Database type in src/lib/database.types.ts so a column rename shows up as a
 * compile error in the pages, not as `undefined` at runtime.
 */
import type { Enums, Tables, TablesInsert } from '@/lib/database.types'

export type SignalCategory = Enums<'signal_category'>
export type SignalSeverity = Enums<'signal_severity'>
export type {
  Json,
  PositionDirection,
  ScoreComponents,
  SentimentLabel,
  TradingSignalType,
} from '@/lib/database.types'

export type Institution = Tables<'institutions'>
export type NewsArticle = Tables<'news_articles'>
export type RiskSignal = Tables<'risk_signals'>
export type RiskScore = Tables<'risk_scores'>
export type AlertConfig = Tables<'alert_configs'>
export type AlertHistory = Tables<'alert_history'>
export type ScoringWeight = Tables<'scoring_weights'>

/** One daily_snapshots row (score + closing price per bank per day). */
export type Snapshot = Tables<'daily_snapshots'>
export type TradingSignal = Tables<'trading_signals'>
export type Position = Tables<'positions'>
export type BenchmarkSnapshot = Tables<'benchmark_snapshots'>

/**
 * Newest score per institution (latest_risk_scores view shape). `score` and
 * `computed_at` are null for a bank that has never been scored.
 */
export type LatestScore = Tables<'latest_risk_scores'>

/** Payload accepted by the positions / alert_configs inserts. */
export type PositionInsert = TablesInsert<'positions'>
export type AlertConfigInsert = TablesInsert<'alert_configs'>

/** One point of a score history line (snapshot_date -> risk_score). */
export interface ScoreHistoryPoint {
  /** ISO date 'YYYY-MM-DD'; parse with parseISO, never new Date('YYYY-MM-DD'). */
  date: string
  score: number
}

/** Newest priced daily snapshot for a bank. */
export interface LatestPrice {
  price: number
  change_pct: number | null
  /** snapshot_date the price belongs to ('YYYY-MM-DD'). */
  date: string
}

/** Badge / accent tone names, matching the colour tokens in src/index.css. */
export type RiskToken = 'risk-1' | 'risk-2' | 'risk-3' | 'risk-4' | 'risk-5'
export type SeverityToken =
  'sev-low' | 'sev-medium' | 'sev-high' | 'sev-critical'
export type Tone =
  'neutral' | 'accent' | 'pos' | 'neg' | RiskToken | SeverityToken
