-- 00004: reconcile git with the live schema and codify the single-tenant security model.
--
-- Every statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / NOT EXISTS guards), so the
-- file is safe on production, where sections 1 and 7 largely exist by hand already, and on a fresh
-- `supabase db reset`. No destructive DDL: no table or column is dropped; policies are dropped only to be
-- recreated under the same name.
--
-- APPLY ORDER (README > Runbook):
--   00003 -> supabase/ops/02_merge_duplicate_institutions.sql (by hand) -> 00004 (this file)
--   -> Vault secrets -> 00005.
-- Section 3 FAILS on production until ops/02 has been run (two active duplicate groups exist today).
-- Requires 00003: the enum values used in section 4 must be committed in an earlier transaction.
--
-- The column lists in section 1 are reconciled from the code that writes these tables and from live row
-- samples (the OpenAPI endpoint is service-role only on this project). Re-verify with `supabase db diff`
-- when the CLI is available.

-- =====================================================================================================
-- 1. Tables that exist on the live project but not in git
--    The unique constraints are proven by the working upserts: daily-snapshot uses
--    onConflict 'institution_id,snapshot_date' and backfill-benchmarks / daily-snapshot use
--    onConflict 'ticker,snapshot_date'.
-- =====================================================================================================
create table if not exists daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  snapshot_date date not null,
  risk_score numeric(5,2) not null default 0,
  score_components jsonb not null default '{}',
  signal_count integer not null default 0,
  stock_price numeric(12,2),          -- null on non-trading days (ops/01 nulls the historical weekend copies)
  stock_change_pct numeric(8,2),
  volume bigint,
  created_at timestamptz not null default now(),
  unique (institution_id, snapshot_date)
);

create table if not exists trading_signals (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  signal_type text not null check (signal_type in ('short_entry', 'short_exit', 'watch')),
  score_at_signal numeric(5,2),
  score_change numeric(6,2),
  price_at_signal numeric(12,2),
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  direction text not null check (direction in ('short', 'long')),
  entry_price numeric(12,2) not null check (entry_price > 0),
  entry_date date not null default current_date,
  entry_score numeric(5,2),
  exit_price numeric(12,2),
  exit_date date,
  exit_score numeric(5,2),
  shares numeric(14,4) not null check (shares > 0),
  notes text,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  check (is_open or (exit_price is not null and exit_date is not null))
);

create table if not exists benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,                -- 'XLF', 'SPY'
  snapshot_date date not null,
  price numeric(12,4) not null,
  change_pct numeric(8,2),
  created_at timestamptz not null default now(),
  unique (ticker, snapshot_date)
);

-- =====================================================================================================
-- 2. Indexes for the hot query shapes
-- =====================================================================================================
-- Validation page: priced snapshot series ordered by date (fetchAll pages over this)
create index if not exists idx_daily_snapshots_date_priced
  on daily_snapshots (snapshot_date) where stock_price is not null;
-- Trading page: active signals newest first; daily-snapshot: "is there an open short_entry for this bank"
create index if not exists idx_trading_signals_active
  on trading_signals (created_at desc) where is_active;
create index if not exists idx_trading_signals_inst_type_active
  on trading_signals (institution_id, signal_type) where is_active;
-- Positions tab: open first, newest first
create index if not exists idx_positions_open
  on positions (is_open desc, created_at desc);
-- Institution page: signals filtered by category
create index if not exists idx_signals_inst_cat_date
  on risk_signals (institution_id, category, signal_date desc);
-- process-articles queue
create index if not exists idx_news_pending
  on news_articles (created_at) where analyzed_at is null;
-- risk_scores is append-only in time order: a BRIN on computed_at serves the bounded
-- "last N hours" reads (latest-score fallback, compute-risk-score previous scores) at negligible size
create index if not exists idx_scores_computed_at_brin
  on risk_scores using brin (computed_at);

-- =====================================================================================================
-- 3. Institutions: uniqueness among ACTIVE rows (F013)
--    Partial on is_active because seeded inactive aliases legitimately share tickers with active rows
--    (BCS, SIVB, MUFG, COIN). Name key strips punctuation so 'Banco Santander, S.A.' and
--    'Banco Santander SA' collide, which is the point: the auto-discovery in process-articles created
--    duplicates from comma names.
--
--    !! supabase/ops/02_merge_duplicate_institutions.sql MUST be run first on production, or these two
--    !! CREATE UNIQUE INDEX statements fail on the existing duplicate rows (UCB x2 active, SAN x2 active).
-- =====================================================================================================
create unique index if not exists institutions_active_ticker_uq
  on institutions (upper(ticker)) where is_active and ticker is not null;
create unique index if not exists institutions_active_name_uq
  on institutions (lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))) where is_active;

-- =====================================================================================================
-- 4. scoring_weights: RLS (it was the only table without it) and the two rows that codify live values
--    (F027). Never update existing rows on conflict here: changing a weight silently changes every future score and breaks
--    backtest continuity. 'lawmaker_selling' 0.05 is the fallback compute-risk-score applies when the
--    row is missing; 'stock_drop' 0.12 is the value back-solved from live scores (00001 seeded 0.15,
--    00002 changed it to 0.13; the live row was edited by hand). On a fresh database stock_drop stays at
--    00002's 0.13 because the row already exists; that one-hundredth difference is a known drift.
--
--    unique(institution_id, category) does not stop duplicate GLOBAL rows (NULLs are distinct in a
--    unique constraint), so the NOT EXISTS guard, not ON CONFLICT, is what makes this idempotent.
--
--    If the live table turns out to be empty (anon cannot see it today, so this was never confirmed):
--    run `select count(*) from scoring_weights;` as postgres first; if it is 0, re-run the inserts from
--    00001 and 00002 before this file so the function stops scoring every category at the 0.05 fallback.
-- =====================================================================================================
alter table scoring_weights enable row level security;
drop policy if exists "public read scoring_weights" on scoring_weights;
create policy "public read scoring_weights" on scoring_weights
  for select to anon, authenticated using (true);

insert into scoring_weights (institution_id, category, weight)
select null::uuid, v.category::signal_category, v.weight
from (values ('lawmaker_selling', 0.05), ('stock_drop', 0.12)) as v(category, weight)
where not exists (
  select 1 from scoring_weights w
  where w.institution_id is null and w.category = v.category::signal_category
)
on conflict (institution_id, category) do nothing;

-- =====================================================================================================
-- 5. latest_risk_scores: one row per ACTIVE institution, null score when it has never been scored (F005)
--    LATERAL does 61 index-top-1 probes via idx_scores_institution instead of a DISTINCT ON pass over
--    all ~314k rows. security_invoker makes the view obey the risk_scores / institutions RLS policies.
--    The frontend reads this view when present and falls back to a bounded risk_scores query on PGRST205.
-- =====================================================================================================
create or replace view latest_risk_scores with (security_invoker = true) as
select
  i.id as institution_id,
  s.score,
  s.score_components,
  s.signal_count,
  s.computed_at
from institutions i
left join lateral (
  select r.score, r.score_components, r.signal_count, r.computed_at
  from risk_scores r
  where r.institution_id = i.id
  order by r.computed_at desc
  limit 1
) s on true
where i.is_active;

grant select on latest_risk_scores to anon, authenticated;

-- =====================================================================================================
-- 6. snapshot_series(p_since): the priced daily_snapshots series as ONE jsonb value, so a single RPC call
--    is not subject to the PostgREST max_rows cap. Optional optimisation: the frontend does not depend
--    on it (it pages daily_snapshots through fetchAll).
-- =====================================================================================================
create or replace function snapshot_series(p_since date default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'institution_id', institution_id,
        'snapshot_date', snapshot_date,
        'risk_score', risk_score,
        'stock_price', stock_price,
        'stock_change_pct', stock_change_pct
      )
      order by snapshot_date, institution_id
    ),
    '[]'::jsonb
  )
  from daily_snapshots
  where stock_price is not null
    and (p_since is null or snapshot_date >= p_since);
$$;

grant execute on function snapshot_series(date) to anon, authenticated;

-- =====================================================================================================
-- 7. Row level security: the no-auth, single-tenant model the app actually uses (F026, F008)
--
--    The frontend is an anonymous client (no sign-in exists). 00001 wrote `to authenticated` read
--    policies and auth.uid()-scoped alert policies that can never match; the live project was patched by
--    hand. This section makes git describe reality: every table is readable by anon, and exactly two
--    tables are writable by anon.
--
--    !! SINGLE-TENANT STOPGAP. The two "client writes ..." policies below let anyone holding the public
--    !! anon key insert, update and delete positions and alert_configs. That is what the Trading and
--    !! Alerts pages rely on today, and it is only acceptable while this is a one-operator tool behind an
--    !! unlisted URL. When auth is added, replace them with auth.uid()-scoped policies and make
--    !! alert_configs.user_id (kept, nullable, unused) NOT NULL. The owner should confirm this decision;
--    !! the alternative is to drop the two policies and accept that the pages cannot write.
--
--    After applying on production, review Dashboard > Authentication > Policies for hand-made policies
--    under other names; they stay in force (policies are permissive, OR-ed) and can be dropped by hand.
-- =====================================================================================================
alter table daily_snapshots enable row level security;
alter table trading_signals enable row level security;
alter table positions enable row level security;
alter table benchmark_snapshots enable row level security;

-- 00001's authenticated-only policies and 00002's untargeted ones, replaced by the loop below
drop policy if exists "Authenticated users can read institutions" on institutions;
drop policy if exists "Authenticated users can read news" on news_articles;
drop policy if exists "Authenticated users can read signals" on risk_signals;
drop policy if exists "Authenticated users can read scores" on risk_scores;
drop policy if exists "Anyone can read insider trades" on insider_trades;
drop policy if exists "Anyone can read sec filings" on sec_filings;
-- unreachable without auth (auth.uid() is null for anon)
drop policy if exists "Users manage own alert configs" on alert_configs;
drop policy if exists "Users read own alert history" on alert_history;

do $$
declare
  t text;
begin
  foreach t in array array[
    'institutions', 'news_articles', 'risk_signals', 'risk_scores', 'alert_configs', 'alert_history',
    'scoring_weights', 'insider_trades', 'sec_filings',
    'daily_snapshots', 'trading_signals', 'positions', 'benchmark_snapshots'
  ] loop
    execute format('drop policy if exists "public read %1$s" on %1$I', t);
    execute format('create policy "public read %1$s" on %1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- single-tenant write policies (see the warning above)
drop policy if exists "client writes positions" on positions;
create policy "client writes positions" on positions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "client writes alert_configs" on alert_configs;
create policy "client writes alert_configs" on alert_configs
  for all to anon, authenticated using (true) with check (true);

-- =====================================================================================================
-- 8. news_articles.url uniqueness (F074): needed by fetch-news' `onConflict: 'url'` upsert.
--    Deliberately NOT created here: the live table holds duplicate urls, so the statement would fail.
--    Run supabase/ops/06_dedupe_news_urls.sql, which deletes the duplicates and creates this exact
--    index in the same transaction. Until then fetch-news falls back to select-then-insert (42P10).
-- =====================================================================================================
-- create unique index if not exists news_articles_url_key on news_articles (url);

-- =====================================================================================================
-- 9. Retention: downsample risk_scores older than 30 days to one row per institution per UTC day (F044)
--    daily_snapshots already keeps the daily score, and no reader needs older hourly rows. The first
--    pass over the existing backlog (~260k rows) is done in batches by supabase/ops/05; this nightly job
--    keeps it that way afterwards. The Bear Stearns seed rows are one per date and survive.
-- =====================================================================================================
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  -- unschedule by jobid: a no-op when the job does not exist (unscheduling by name would raise)
  perform cron.unschedule(jobid) from cron.job where jobname = 'downsample-risk-scores';
  perform cron.schedule(
    'downsample-risk-scores',
    '30 3 * * *',
    $job$
      delete from risk_scores r
      using (
        select id
        from (
          select id,
                 row_number() over (
                   partition by institution_id, (computed_at at time zone 'utc')::date
                   order by computed_at desc) as rn
          from risk_scores
          where computed_at < now() - interval '30 days'
        ) t
        where rn > 1
      ) d
      where r.id = d.id
    $job$
  );
end $$;
