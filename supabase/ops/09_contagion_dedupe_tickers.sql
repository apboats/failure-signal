-- ONE-OFF: clean up after the 2026-11-19 signal-rule fixes, and fix stale tickers.
-- Run with `supabase db query --remote --yes -f` or in the SQL editor (service role). Not a migration.
-- Applied to production on 2026-11-19. Idempotent: re-running finds nothing left to do.
--
-- 1. Peer contagion. The Deutsche Bank leak (a compliance scandal, not funding stress) raised
--    peer_contagion on 49 banks that only shared the "banking" label. compute-risk-score now requires
--    the jump to be funding-driven (supabase/functions/_shared/signalRules.ts). Those 49 rows are
--    removed; they are the only peer_contagion rows on the project.
-- 2. Duplicate signals. Many articles about one event each produced signals. process-articles now
--    drops a repeat of a same-category signal within 3 days unless severity escalates. The same rule
--    is applied to the last 30 days here (older signals have fully decayed out of the score).
-- 3. Tickers. BNY Mellon trades as BNY (was BK) and New York Community Bancorp is now Flagstar (FLG);
--    neither had a price since the change. Discover (DFS) and Comerica (CMA) have no prices at all and
--    are gone from the SEC ticker list; Webster (WBS) stopped trading after 2026-08-19. Those three are
--    deactivated, not deleted.
--
-- Every deleted signal is copied to public.risk_signals_archive first.

create table if not exists public.risk_signals_archive (
  like public.risk_signals including defaults,
  archived_at timestamptz not null default now(),
  archive_reason text not null
);
alter table public.risk_signals_archive enable row level security;

begin;

-- 1. Contagion from the Deutsche Bank leak
with gone as (
  delete from risk_signals
  where category = 'peer_contagion'
    and title like 'Peer risk spike: Deutsche Bank%'
  returning *
)
insert into risk_signals_archive
select gone.*, now(), 'peer_contagion not funding-driven (Deutsche Bank leak)' from gone;

-- 2. Duplicates: walk each bank/category in date order, keep a signal unless an already-kept one
--    within 3 days is at least as severe.
create temp table dupes (id uuid primary key) on commit drop;
do $$
declare
  grp record;
  sig record;
  kept_dates timestamptz[];
  kept_ranks int[];
  r int;
  i int;
  duplicate boolean;
begin
  for grp in
    select distinct institution_id, category
    from risk_signals
    where signal_date > now() - interval '30 days' and category <> 'peer_contagion'
  loop
    kept_dates := '{}';
    kept_ranks := '{}';
    -- most severe first within a day, so the escalation is the one kept
    for sig in
      select id, signal_date,
             case severity when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end as rnk
      from risk_signals
      where institution_id = grp.institution_id and category = grp.category
        and signal_date > now() - interval '30 days'
      order by signal_date, 3 desc, created_at, id
    loop
      duplicate := false;
      for i in 1 .. coalesce(array_length(kept_dates, 1), 0) loop
        if abs(extract(epoch from sig.signal_date - kept_dates[i])) <= 3 * 86400
           and kept_ranks[i] >= sig.rnk then
          duplicate := true;
          exit;
        end if;
      end loop;
      if duplicate then
        insert into dupes values (sig.id);
      else
        kept_dates := kept_dates || sig.signal_date;
        kept_ranks := kept_ranks || sig.rnk;
      end if;
    end loop;
  end loop;
end $$;

with gone as (
  delete from risk_signals s using dupes d where s.id = d.id returning s.*
)
insert into risk_signals_archive
select gone.*, now(), 'duplicate of a same-category signal within 3 days' from gone;

-- 3. Tickers
update institutions set ticker = 'BNY', cik = coalesce(cik, '0001390777'), updated_at = now()
where ticker = 'BK' and is_active;
update institutions
set ticker = 'FLG', name = 'Flagstar Financial (formerly New York Community Bancorp)',
    cik = coalesce(cik, '0000910073'), updated_at = now()
where ticker = 'NYCB' and is_active;
update institutions
set is_active = false, review_status = 'ignored', reviewed_at = now(), updated_at = now()
where ticker in ('DFS', 'CMA', 'WBS') and is_active;

select
  (select count(*) from risk_signals_archive) as archived_signals,
  (select count(*) from risk_signals_archive where archive_reason like 'peer_contagion%') as archived_contagion,
  (select count(*) from risk_signals where signal_date > now() - interval '30 days') as signals_30d_now,
  (select count(*) from institutions where is_active) as active_institutions,
  (select string_agg(ticker, ' ' order by ticker) from institutions where ticker in ('BNY', 'FLG') and is_active) as renamed;

commit;
