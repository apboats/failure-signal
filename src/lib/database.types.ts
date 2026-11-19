/**
 * Hand-written Supabase `Database` type for the live project (the Supabase CLI is
 * not installed, so `supabase gen types` cannot run). It mirrors
 * supabase/migrations/00001-00002 plus the objects that exist only in the live
 * database: daily_snapshots, trading_signals, positions, benchmark_snapshots and
 * the latest_risk_scores view (see supabase/migrations/00003 once it lands).
 *
 * Nullability: columns that have a default (`id`, `created_at`, `is_active`,
 * `sector`, `signal_count`, ...) are typed non-null because every writer relies
 * on the default and the live data holds no nulls in them (verified read-only on
 * 2026-11-18). Columns without a default that are nullable in SQL are `| null`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Postgres enum `signal_category` (00001 + the four values added live). */
export type SignalCategory =
  | 'stock_drop'
  | 'cds_spike'
  | 'liquidity_warning'
  | 'client_withdrawal'
  | 'counterparty_action'
  | 'regulatory_signal'
  | 'credit_downgrade'
  | 'executive_departure'
  | 'news_sentiment'
  | 'insider_selling'
  | 'peer_contagion'
  | 'social_panic'
  | 'lawmaker_selling'

/** Postgres enum `signal_severity`. */
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical'

/** news_articles.sentiment_label check constraint. */
export type SentimentLabel =
  'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive'

/** trading_signals.signal_type as written by the daily-snapshot function. */
export type TradingSignalType = 'short_entry' | 'short_exit' | 'watch'

/** positions.direction. */
export type PositionDirection = 'short' | 'long'

/**
 * jsonb map category -> normalised evidence (0-100) written by compute-risk-score.
 * Only categories with evidence are present, so every key is optional. Iterate
 * with `componentEntries()` from src/domain/signals.ts rather than indexing.
 */
export type ScoreComponents = Partial<Record<SignalCategory, number>>

/** Insert shape: the listed keys are required, every other column is optional (default or nullable). */
type InsertOf<Row, RequiredKeys extends keyof Row> = Pick<Row, RequiredKeys> &
  Partial<Omit<Row, RequiredKeys>>

// Row shapes are `type` aliases, not interfaces: supabase-js constrains Row to
// Record<string, unknown>, which an interface (no implicit index signature) fails,
// silently collapsing every query result to `never`.

type Fk<
  Name extends string,
  Column extends string,
  Referenced extends string,
> = {
  foreignKeyName: Name
  columns: [Column]
  isOneToOne: false
  referencedRelation: Referenced
  referencedColumns: ['id']
}

type ToInstitution<Name extends string> = Fk<
  Name,
  'institution_id',
  'institutions'
>

type InstitutionRow = {
  id: string
  name: string
  ticker: string | null
  sector: string
  description: string | null
  logo_url: string | null
  is_active: boolean
  cik: string | null
  created_at: string
  updated_at: string
  /** Set when the news pipeline created the row (migration 00006); null for hand-seeded banks. */
  discovered_at: string | null
  review_status: ReviewStatus | null
  reviewed_at: string | null
  /** 0..1 estimate from classify-pending; null until it has run. */
  us_bank_probability: number | null
  review_evidence: ReviewEvidence | null
}

export type ReviewStatus = 'pending' | 'approved' | 'ignored'
export type ReviewDecision = 'track' | 'ignore' | 'pending'

/** What classify-pending based its estimate on. */
export type ReviewEvidence = {
  checked_at?: string
  matched_by?: 'ticker' | 'name' | null
  sec_name?: string | null
  cik?: string | null
  sic?: string | null
  sic_description?: string | null
  exchanges?: string[]
  state_or_country?: string | null
  reasons?: string[]
}

type NewsArticleRow = {
  id: string
  institution_id: string
  title: string
  source: string | null
  url: string | null
  published_at: string | null
  raw_content: string | null
  summary: string | null
  sentiment_score: number | null
  sentiment_label: SentimentLabel | null
  relevance_score: number | null
  analyzed_at: string | null
  created_at: string
}

type RiskSignalRow = {
  id: string
  institution_id: string
  news_article_id: string | null
  category: SignalCategory
  severity: SignalSeverity
  title: string
  description: string | null
  signal_value: number | null
  signal_date: string
  source: string | null
  is_confirmed: boolean
  created_at: string
}

type RiskScoreRow = {
  id: string
  institution_id: string
  score: number
  /**
   * At runtime this is the sparse `ScoreComponents` map. It is typed as the full
   * record only so the legacy InstitutionDetail -> RiskBreakdown path (deleted in
   * WP10) keeps compiling; the api layer re-exposes it as `ScoreComponents`.
   * Never index a category directly, use `componentEntries()`.
   */
  score_components: Record<SignalCategory, number>
  signal_count: number
  computed_at: string
}

type AlertConfigRow = {
  id: string
  institution_id: string
  /** Unused: the app is single-tenant and signs nobody in. */
  user_id: string | null
  threshold_score: number
  signal_categories: SignalCategory[] | null
  notify_email: boolean
  notify_in_app: boolean
  is_active: boolean
  created_at: string
}

type AlertHistoryRow = {
  id: string
  alert_config_id: string
  institution_id: string
  triggered_score: number | null
  trigger_reason: string | null
  acknowledged_at: string | null
  created_at: string
}

type ScoringWeightRow = {
  id: string
  /** null = global default weight. */
  institution_id: string | null
  category: SignalCategory
  weight: number
  created_at: string
  updated_at: string
}

type InsiderTradeRow = {
  id: string
  institution_id: string
  filing_url: string
  filer_name: string
  filer_title: string | null
  transaction_type: string | null
  shares_traded: number | null
  price_per_share: number | null
  shares_remaining: number | null
  transaction_date: string
  filing_date: string
  created_at: string
}

type SecFilingRow = {
  id: string
  institution_id: string
  filing_type: string
  filing_url: string
  filing_date: string
  period_end: string | null
  total_equity: number | null
  unrealized_losses_afs: number | null
  unrealized_losses_htm: number | null
  uninsured_deposits_pct: number | null
  total_deposits: number | null
  raw_analysis: Json | null
  analyzed_at: string | null
  created_at: string
}

/** One row per institution per day, written by daily-snapshot at 22:00 UTC. */
type DailySnapshotRow = {
  id: string
  institution_id: string
  /** Date only, 'YYYY-MM-DD'. */
  snapshot_date: string
  risk_score: number
  score_components: ScoreComponents
  signal_count: number
  stock_price: number | null
  stock_change_pct: number | null
  volume: number | null
  created_at: string
}

type TradingSignalRow = {
  id: string
  institution_id: string
  signal_type: TradingSignalType
  score_at_signal: number
  score_change: number
  price_at_signal: number | null
  reason: string
  is_active: boolean
  created_at: string
}

type PositionRow = {
  id: string
  institution_id: string
  direction: PositionDirection
  entry_price: number
  /** Date only, 'YYYY-MM-DD'. */
  entry_date: string
  entry_score: number | null
  exit_price: number | null
  exit_date: string | null
  exit_score: number | null
  shares: number
  notes: string | null
  is_open: boolean
  created_at: string
}

type BenchmarkSnapshotRow = {
  id: string
  ticker: string
  snapshot_date: string
  price: number
  change_pct: number | null
  created_at: string
}

/**
 * View `latest_risk_scores`: one row per active institution with its newest
 * risk_scores row LEFT JOINed, so a never-scored bank has null score fields.
 * Not present in the live database yet; src/api/scores.ts falls back when absent.
 */
type LatestRiskScoreRow = {
  institution_id: string
  score: number | null
  score_components: ScoreComponents | null
  signal_count: number | null
  computed_at: string | null
}

export type Database = {
  public: {
    Tables: {
      institutions: {
        Row: InstitutionRow
        Insert: InsertOf<InstitutionRow, 'name'>
        Update: Partial<InstitutionRow>
        Relationships: []
      }
      news_articles: {
        Row: NewsArticleRow
        Insert: InsertOf<NewsArticleRow, 'institution_id' | 'title'>
        Update: Partial<NewsArticleRow>
        Relationships: [ToInstitution<'news_articles_institution_id_fkey'>]
      }
      risk_signals: {
        Row: RiskSignalRow
        Insert: InsertOf<
          RiskSignalRow,
          'institution_id' | 'category' | 'title' | 'signal_date'
        >
        Update: Partial<RiskSignalRow>
        Relationships: [
          ToInstitution<'risk_signals_institution_id_fkey'>,
          Fk<
            'risk_signals_news_article_id_fkey',
            'news_article_id',
            'news_articles'
          >,
        ]
      }
      risk_scores: {
        Row: RiskScoreRow
        Insert: InsertOf<RiskScoreRow, 'institution_id' | 'score'>
        Update: Partial<RiskScoreRow>
        Relationships: [ToInstitution<'risk_scores_institution_id_fkey'>]
      }
      alert_configs: {
        Row: AlertConfigRow
        Insert: InsertOf<AlertConfigRow, 'institution_id'>
        Update: Partial<AlertConfigRow>
        Relationships: [ToInstitution<'alert_configs_institution_id_fkey'>]
      }
      alert_history: {
        Row: AlertHistoryRow
        Insert: InsertOf<AlertHistoryRow, 'alert_config_id' | 'institution_id'>
        Update: Partial<AlertHistoryRow>
        Relationships: [
          ToInstitution<'alert_history_institution_id_fkey'>,
          Fk<
            'alert_history_alert_config_id_fkey',
            'alert_config_id',
            'alert_configs'
          >,
        ]
      }
      scoring_weights: {
        Row: ScoringWeightRow
        Insert: InsertOf<ScoringWeightRow, 'category'>
        Update: Partial<ScoringWeightRow>
        Relationships: [ToInstitution<'scoring_weights_institution_id_fkey'>]
      }
      insider_trades: {
        Row: InsiderTradeRow
        Insert: InsertOf<
          InsiderTradeRow,
          | 'institution_id'
          | 'filing_url'
          | 'filer_name'
          | 'transaction_date'
          | 'filing_date'
        >
        Update: Partial<InsiderTradeRow>
        Relationships: [ToInstitution<'insider_trades_institution_id_fkey'>]
      }
      sec_filings: {
        Row: SecFilingRow
        Insert: InsertOf<
          SecFilingRow,
          'institution_id' | 'filing_type' | 'filing_url' | 'filing_date'
        >
        Update: Partial<SecFilingRow>
        Relationships: [ToInstitution<'sec_filings_institution_id_fkey'>]
      }
      daily_snapshots: {
        Row: DailySnapshotRow
        Insert: InsertOf<
          DailySnapshotRow,
          'institution_id' | 'snapshot_date' | 'risk_score'
        >
        Update: Partial<DailySnapshotRow>
        Relationships: [ToInstitution<'daily_snapshots_institution_id_fkey'>]
      }
      trading_signals: {
        Row: TradingSignalRow
        Insert: InsertOf<
          TradingSignalRow,
          | 'institution_id'
          | 'signal_type'
          | 'score_at_signal'
          | 'score_change'
          | 'reason'
        >
        Update: Partial<TradingSignalRow>
        Relationships: [ToInstitution<'trading_signals_institution_id_fkey'>]
      }
      positions: {
        Row: PositionRow
        Insert: InsertOf<
          PositionRow,
          | 'institution_id'
          | 'direction'
          | 'entry_price'
          | 'entry_date'
          | 'shares'
        >
        Update: Partial<PositionRow>
        Relationships: [ToInstitution<'positions_institution_id_fkey'>]
      }
      benchmark_snapshots: {
        Row: BenchmarkSnapshotRow
        Insert: InsertOf<
          BenchmarkSnapshotRow,
          'ticker' | 'snapshot_date' | 'price'
        >
        Update: Partial<BenchmarkSnapshotRow>
        Relationships: []
      }
    }
    Views: {
      latest_risk_scores: {
        Row: LatestRiskScoreRow
        Relationships: []
      }
    }
    Functions: {
      review_institution: {
        Args: { p_id: string; p_decision: ReviewDecision }
        Returns: {
          id: string
          is_active: boolean
          review_status: ReviewStatus
        }[]
      }
    }
    Enums: {
      signal_category: SignalCategory
      signal_severity: SignalSeverity
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database['public']
type Relations = PublicSchema['Tables'] & PublicSchema['Views']

/** Row type of a table or view: `Tables<'institutions'>`. */
export type Tables<Name extends keyof Relations> = Relations[Name]['Row']

/** Insert payload of a table: `TablesInsert<'positions'>`. */
export type TablesInsert<Name extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][Name]['Insert']

/** Update payload of a table: `TablesUpdate<'alert_configs'>`. */
export type TablesUpdate<Name extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][Name]['Update']

/** A Postgres enum: `Enums<'signal_category'>`. */
export type Enums<Name extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][Name]
