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

export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical'

export type SentimentLabel =
  | 'very_negative'
  | 'negative'
  | 'neutral'
  | 'positive'
  | 'very_positive'

export interface Institution {
  id: string
  name: string
  ticker: string | null
  sector: string
  description: string | null
  logo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NewsArticle {
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

export interface RiskSignal {
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

export interface RiskScore {
  id: string
  institution_id: string
  score: number
  score_components: Record<SignalCategory, number>
  signal_count: number
  computed_at: string
}

export interface AlertConfig {
  id: string
  institution_id: string
  user_id: string
  threshold_score: number
  signal_categories: SignalCategory[] | null
  notify_email: boolean
  notify_in_app: boolean
  is_active: boolean
  created_at: string
}

export interface AlertHistory {
  id: string
  alert_config_id: string
  institution_id: string
  triggered_score: number | null
  trigger_reason: string | null
  acknowledged_at: string | null
  created_at: string
}
