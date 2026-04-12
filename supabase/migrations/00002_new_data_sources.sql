-- New data sources: insider trading, peer contagion, social sentiment, SEC filings

-- Add CIK to institutions for SEC EDGAR lookups
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS cik text;

-- Insider trades tracking
CREATE TABLE IF NOT EXISTS insider_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  filing_url text UNIQUE NOT NULL,
  filer_name text NOT NULL,
  filer_title text,
  transaction_type text,
  shares_traded numeric,
  price_per_share numeric,
  shares_remaining numeric,
  transaction_date date NOT NULL,
  filing_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insider_trades_institution ON insider_trades(institution_id, transaction_date DESC);

-- SEC filings analysis
CREATE TABLE IF NOT EXISTS sec_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  filing_type text NOT NULL,
  filing_url text UNIQUE NOT NULL,
  filing_date date NOT NULL,
  period_end date,
  total_equity numeric,
  unrealized_losses_afs numeric,
  unrealized_losses_htm numeric,
  uninsured_deposits_pct numeric,
  total_deposits numeric,
  raw_analysis jsonb,
  analyzed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_filings_institution ON sec_filings(institution_id, filing_date DESC);

-- RLS for new tables
ALTER TABLE insider_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read insider trades" ON insider_trades FOR SELECT USING (true);
CREATE POLICY "Anyone can read sec filings" ON sec_filings FOR SELECT USING (true);

-- Update scoring weights with new categories
INSERT INTO scoring_weights (institution_id, category, weight) VALUES
  (null, 'insider_selling', 0.07),
  (null, 'peer_contagion', 0.06),
  (null, 'social_panic', 0.04)
ON CONFLICT (institution_id, category) DO UPDATE SET weight = EXCLUDED.weight;

-- Adjust existing weights to sum to 1.0
UPDATE scoring_weights SET weight = 0.17 WHERE institution_id IS NULL AND category = 'cds_spike';
UPDATE scoring_weights SET weight = 0.17 WHERE institution_id IS NULL AND category = 'liquidity_warning';
UPDATE scoring_weights SET weight = 0.13 WHERE institution_id IS NULL AND category = 'stock_drop';
UPDATE scoring_weights SET weight = 0.13 WHERE institution_id IS NULL AND category = 'client_withdrawal';
UPDATE scoring_weights SET weight = 0.08 WHERE institution_id IS NULL AND category = 'counterparty_action';
UPDATE scoring_weights SET weight = 0.07 WHERE institution_id IS NULL AND category = 'credit_downgrade';
UPDATE scoring_weights SET weight = 0.06 WHERE institution_id IS NULL AND category = 'regulatory_signal';
UPDATE scoring_weights SET weight = 0.02 WHERE institution_id IS NULL AND category = 'executive_departure';
UPDATE scoring_weights SET weight = 0.04 WHERE institution_id IS NULL AND category = 'news_sentiment';
