-- 00007: local copy of the SEC ticker list.
--
-- classify-pending needs ticker -> CIK lookups. https://www.sec.gov/files/company_tickers.json answers
-- 429 to requests from Supabase's shared egress addresses (data.sec.gov, which serves the per-company
-- records, does not), so the list is loaded into this table by scripts/refresh-sec-tickers.mjs from a
-- normal machine and the function reads it here. Ticker-to-CIK mappings change rarely; refresh monthly.

create table if not exists sec_company_tickers (
  ticker text primary key,
  cik text not null,
  title text not null,
  -- normalizeCompanyName(title) from supabase/functions/_shared/bankClassifier.ts
  normalized_title text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_sec_company_tickers_title on sec_company_tickers (normalized_title);

-- Service role only: no policies for anon or authenticated.
alter table sec_company_tickers enable row level security;
