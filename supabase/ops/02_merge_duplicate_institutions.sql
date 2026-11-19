-- ONE-OFF: merge the duplicate institution rows created by the old auto-discovery (F013).
-- Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- MUST run BEFORE supabase/migrations/00004_reconcile_live_schema.sql, whose section 3 creates partial
-- unique indexes on active institutions (upper(ticker) and the punctuation-stripped name) and fails while
-- these duplicates exist.
--
-- WHY: process-articles built a PostgREST `.or('name.ilike.%<name>%,...')` filter; PostgREST splits
-- `or=` on commas, so every legal name with a comma ('Banco Santander, S.A.', 'United Community Banks,
-- Inc.') returned 400, the lookup saw "not found" and inserted a new row. Signals, news, snapshots and
-- scores are split across ids and the Watchlist shows the bank twice. WP11 replaces the lookup with an
-- in-memory matcher; this script repairs the data.
--
-- GROUPS (verified read-only on 2026-11-18; these are the only two active duplicate groups):
--   SAN  keep  f9b034a9-f160-4ee1-b3d5-59bb571fd9c2  'Banco Santander'        seeded 2026-04-12, is_active=false today,
--                                                      holds the 23 original signals -> re-activated below
--        merge b6af3227-89a2-46c3-b174-1b7fe5801ed8  'Banco Santander, S.A.'  auto-created 2026-05-28, active
--        merge 95e01282-fd3c-4d3b-9ff5-712f6c195e8d  'Banco Santander, S.A.'  auto-created 2026-06-11, active
--   UCB  keep  b46ca82a-8d12-419f-a242-2c8d95550c6f  'United Community Banks, Inc.'  oldest (2026-04-22), active
--        merge 629013b4-6600-465b-bfb6-0acc3ae2bf13  'United Community Banks, Inc.'  2026-04-22, inactive
--        merge f45a8e4c-7075-4f34-aa4d-32b9c3c76e7a  'United Community Banks, Inc.'  2026-06-13, active
--
-- WHAT IT DOES, per group, inside one transaction:
--   a) deletes loser daily_snapshots / risk_scores rows that would collide with the survivor (or with
--      another loser) on the unique keys (institution_id, snapshot_date) / (institution_id, computed_at),
--      keeping the survivor's row, then the older row;
--   b) re-points institution_id on risk_signals, news_articles, trading_signals, risk_scores,
--      daily_snapshots, insider_trades, sec_filings, alert_configs, alert_history and positions;
--   c) deletes per-institution scoring_weights rows of the losers (the FK is ON DELETE SET NULL, which
--      would otherwise silently turn them into GLOBAL weights);
--   d) marks the survivor active and copies cik/description from a loser when the survivor has none;
--   e) deletes the loser institution rows and asserts no active duplicate group remains.

-- =====================================================================================================
-- INSPECT (run on its own first)
-- =====================================================================================================
select id, name, ticker, is_active, created_at, cik
from institutions
where id in (
  'f9b034a9-f160-4ee1-b3d5-59bb571fd9c2', 'b6af3227-89a2-46c3-b174-1b7fe5801ed8', '95e01282-fd3c-4d3b-9ff5-712f6c195e8d',
  'b46ca82a-8d12-419f-a242-2c8d95550c6f', '629013b4-6600-465b-bfb6-0acc3ae2bf13', 'f45a8e4c-7075-4f34-aa4d-32b9c3c76e7a'
)
order by ticker, created_at;

-- Rows attached to each id (what moves to the survivor)
select i.ticker, i.id, i.is_active,
  (select count(*) from risk_signals     where institution_id = i.id) as signals,
  (select count(*) from news_articles    where institution_id = i.id) as news,
  (select count(*) from risk_scores      where institution_id = i.id) as scores,
  (select count(*) from daily_snapshots  where institution_id = i.id) as snapshots,
  (select count(*) from trading_signals  where institution_id = i.id) as trading,
  (select count(*) from positions        where institution_id = i.id) as positions,
  (select count(*) from alert_configs    where institution_id = i.id) as alerts
from institutions i
where i.id in (
  'f9b034a9-f160-4ee1-b3d5-59bb571fd9c2', 'b6af3227-89a2-46c3-b174-1b7fe5801ed8', '95e01282-fd3c-4d3b-9ff5-712f6c195e8d',
  'b46ca82a-8d12-419f-a242-2c8d95550c6f', '629013b4-6600-465b-bfb6-0acc3ae2bf13', 'f45a8e4c-7075-4f34-aa4d-32b9c3c76e7a'
)
order by i.ticker, i.created_at;

-- Every active duplicate group right now (expected: exactly SAN and UCB). If another ticker or name
-- shows up, add it to the VALUES list in the WRITE block before running it.
select 'ticker' as key_kind, upper(ticker) as key, count(*) as active_rows, array_agg(id order by created_at) as ids
from institutions
where is_active and ticker is not null
group by upper(ticker)
having count(*) > 1
union all
select 'name', lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')), count(*), array_agg(id order by created_at)
from institutions
where is_active
group by lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
having count(*) > 1
order by key_kind, key;

-- =====================================================================================================
-- WRITE (one transaction; the DO blocks raise and roll everything back if an assertion fails)
-- =====================================================================================================
begin;

do $$
declare
  g record;
  n bigint;
begin
  for g in
    select *
    from (values
      ('f9b034a9-f160-4ee1-b3d5-59bb571fd9c2'::uuid,
       array['b6af3227-89a2-46c3-b174-1b7fe5801ed8', '95e01282-fd3c-4d3b-9ff5-712f6c195e8d']::uuid[]),
      ('b46ca82a-8d12-419f-a242-2c8d95550c6f'::uuid,
       array['629013b4-6600-465b-bfb6-0acc3ae2bf13', 'f45a8e4c-7075-4f34-aa4d-32b9c3c76e7a']::uuid[])
    ) as v(survivor, losers)
  loop
    -- guard: every id in the group must exist, otherwise the file is stale
    if (select count(*) from institutions where id = g.survivor or id = any(g.losers))
       <> array_length(g.losers, 1) + 1 then
      raise exception 'group for survivor %: not all ids exist, aborting', g.survivor;
    end if;

    -- a) unique-key collisions: survivor wins, then the older loser row wins
    delete from daily_snapshots s
    using daily_snapshots k
    where s.institution_id = any(g.losers)
      and k.institution_id = g.survivor
      and k.snapshot_date = s.snapshot_date;
    get diagnostics n = row_count;
    raise notice '[%] dropped % loser daily_snapshots colliding with the survivor', g.survivor, n;

    delete from daily_snapshots s
    using daily_snapshots k
    where s.institution_id = any(g.losers)
      and k.institution_id = any(g.losers)
      and k.id <> s.id
      and k.snapshot_date = s.snapshot_date
      and (k.created_at, k.id) < (s.created_at, s.id);
    get diagnostics n = row_count;
    raise notice '[%] dropped % loser daily_snapshots colliding with another loser', g.survivor, n;

    delete from risk_scores s
    using risk_scores k
    where s.institution_id = any(g.losers)
      and k.institution_id = g.survivor
      and k.computed_at = s.computed_at;
    get diagnostics n = row_count;
    raise notice '[%] dropped % loser risk_scores colliding with the survivor', g.survivor, n;

    delete from risk_scores s
    using risk_scores k
    where s.institution_id = any(g.losers)
      and k.institution_id = any(g.losers)
      and k.id <> s.id
      and k.computed_at = s.computed_at
      and k.id < s.id;
    get diagnostics n = row_count;
    raise notice '[%] dropped % loser risk_scores colliding with another loser', g.survivor, n;

    -- b) re-point everything else
    update risk_signals    set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % risk_signals', g.survivor, n;
    update news_articles   set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % news_articles', g.survivor, n;
    update trading_signals set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % trading_signals', g.survivor, n;
    update risk_scores     set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % risk_scores', g.survivor, n;
    update daily_snapshots set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % daily_snapshots', g.survivor, n;
    update insider_trades  set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % insider_trades', g.survivor, n;
    update sec_filings     set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % sec_filings', g.survivor, n;
    update alert_configs   set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % alert_configs', g.survivor, n;
    update alert_history   set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % alert_history', g.survivor, n;
    update positions       set institution_id = g.survivor where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] moved % positions', g.survivor, n;

    -- c) per-institution weights of the losers: delete, never let ON DELETE SET NULL make them global
    delete from scoring_weights where institution_id = any(g.losers);
    get diagnostics n = row_count; raise notice '[%] deleted % per-institution scoring_weights', g.survivor, n;

    -- d) survivor becomes the active row; fill cik/description from a loser only when missing
    update institutions i
    set is_active   = true,
        cik         = coalesce(i.cik,         (select cik         from institutions where id = any(g.losers) and cik         is not null order by created_at limit 1)),
        description = coalesce(i.description, (select description from institutions where id = any(g.losers) and description is not null order by created_at limit 1)),
        updated_at  = now()
    where i.id = g.survivor;

    -- e) remove the losers (nothing references them any more; cascades would be no-ops)
    delete from institutions where id = any(g.losers);
    get diagnostics n = row_count;
    if n <> array_length(g.losers, 1) then
      raise exception 'group for survivor %: expected to delete % losers, deleted %', g.survivor, array_length(g.losers, 1), n;
    end if;
  end loop;
end $$;

-- Assertion: no active duplicate group may remain (00004 section 3 depends on it)
do $$
declare
  dup_ticker int;
  dup_name int;
begin
  select count(*) into dup_ticker from (
    select 1 from institutions where is_active and ticker is not null
    group by upper(ticker) having count(*) > 1) t;
  select count(*) into dup_name from (
    select 1 from institutions where is_active
    group by lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) having count(*) > 1) t;
  if dup_ticker > 0 or dup_name > 0 then
    raise exception 'active duplicates remain (ticker groups: %, name groups: %); rolling back', dup_ticker, dup_name;
  end if;
  raise notice 'no active duplicate institutions remain';
end $$;

-- VERIFY (result set): the two survivors, active, with the merged row counts
select i.ticker, i.id, i.name, i.is_active,
  (select count(*) from risk_signals    where institution_id = i.id) as signals,
  (select count(*) from news_articles   where institution_id = i.id) as news,
  (select count(*) from risk_scores     where institution_id = i.id) as scores,
  (select count(*) from daily_snapshots where institution_id = i.id) as snapshots,
  (select count(*) from trading_signals where institution_id = i.id) as trading
from institutions i
where i.id in ('f9b034a9-f160-4ee1-b3d5-59bb571fd9c2', 'b46ca82a-8d12-419f-a242-2c8d95550c6f')
order by i.ticker;

commit;
