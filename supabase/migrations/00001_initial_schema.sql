-- Failure Signal: Initial Schema
-- Financial institution early-warning monitoring system

-- Institutions being monitored
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text,
  sector text default 'banking',
  description text,
  logo_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- News articles linked to institutions
create table news_articles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete cascade,
  title text not null,
  source text,
  url text,
  published_at timestamptz,
  raw_content text,
  summary text,
  sentiment_score numeric(4,3),
  sentiment_label text check (sentiment_label in ('very_negative','negative','neutral','positive','very_positive')),
  relevance_score numeric(3,2),
  analyzed_at timestamptz,
  created_at timestamptz default now()
);

-- Signal categories and severities
create type signal_category as enum (
  'stock_drop',
  'cds_spike',
  'liquidity_warning',
  'client_withdrawal',
  'counterparty_action',
  'regulatory_signal',
  'credit_downgrade',
  'executive_departure',
  'news_sentiment'
);

create type signal_severity as enum ('low', 'medium', 'high', 'critical');

-- Individual risk signals
create table risk_signals (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete cascade,
  news_article_id uuid references news_articles(id) on delete set null,
  category signal_category not null,
  severity signal_severity not null default 'low',
  title text not null,
  description text,
  signal_value numeric,
  signal_date timestamptz not null,
  source text,
  is_confirmed boolean default false,
  created_at timestamptz default now()
);

-- Composite risk scores over time
create table risk_scores (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete cascade,
  score numeric(5,2) not null,
  score_components jsonb not null default '{}',
  signal_count integer default 0,
  computed_at timestamptz default now(),
  unique(institution_id, computed_at)
);

-- Alert configurations
create table alert_configs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  threshold_score numeric(5,2) not null default 50.00,
  signal_categories signal_category[],
  notify_email boolean default true,
  notify_in_app boolean default true,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Alert history
create table alert_history (
  id uuid primary key default gen_random_uuid(),
  alert_config_id uuid references alert_configs(id) on delete cascade,
  institution_id uuid references institutions(id) on delete cascade,
  triggered_score numeric(5,2),
  trigger_reason text,
  acknowledged_at timestamptz,
  created_at timestamptz default now()
);

-- Scoring weights (null institution_id = global default)
create table scoring_weights (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete set null,
  category signal_category not null,
  weight numeric(3,2) not null default 0.10,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(institution_id, category)
);

-- Indexes
create index idx_news_institution on news_articles(institution_id, published_at desc);
create index idx_signals_institution on risk_signals(institution_id, signal_date desc);
create index idx_signals_category on risk_signals(category, signal_date desc);
create index idx_scores_institution on risk_scores(institution_id, computed_at desc);
create index idx_alert_history_institution on alert_history(institution_id, created_at desc);

-- RLS
alter table institutions enable row level security;
alter table news_articles enable row level security;
alter table risk_signals enable row level security;
alter table risk_scores enable row level security;
alter table alert_configs enable row level security;
alter table alert_history enable row level security;

create policy "Authenticated users can read institutions"
  on institutions for select to authenticated using (true);

create policy "Authenticated users can read news"
  on news_articles for select to authenticated using (true);

create policy "Authenticated users can read signals"
  on risk_signals for select to authenticated using (true);

create policy "Authenticated users can read scores"
  on risk_scores for select to authenticated using (true);

create policy "Users manage own alert configs"
  on alert_configs for all to authenticated
  using (auth.uid() = user_id);

create policy "Users read own alert history"
  on alert_history for select to authenticated
  using (alert_config_id in (
    select id from alert_configs where user_id = auth.uid()
  ));

-- Seed default scoring weights (global)
insert into scoring_weights (institution_id, category, weight) values
  (null, 'cds_spike', 0.20),
  (null, 'liquidity_warning', 0.20),
  (null, 'stock_drop', 0.15),
  (null, 'client_withdrawal', 0.15),
  (null, 'counterparty_action', 0.10),
  (null, 'credit_downgrade', 0.08),
  (null, 'regulatory_signal', 0.07),
  (null, 'executive_departure', 0.00),
  (null, 'news_sentiment', 0.05);
