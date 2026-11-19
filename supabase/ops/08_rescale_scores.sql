-- ONE-OFF: move every stored score from the raw composite to the display scale.
-- Run by hand in the Supabase SQL editor (service role) or with `supabase db query --remote -f`.
-- Not a migration. Applied to production on 2026-11-18.
--
-- WHY (F019): the raw composite is structurally pinned near zero (per-category caps x sub-1 weights;
-- live maximum 33.5, most days below 7), so a 0-100 index read as "Low" for everything. The
-- compute-risk-score function now stores display = 100 x (1 - exp(-raw / 16)) and keeps the raw value in
-- score_components._raw (see shared/thresholds.ts). This script applies the same monotone transform to
-- the history so charts, the event study and trading signals stay comparable with new rows.
--
-- ORDER: run AFTER the rescaled compute-risk-score is deployed. Rows it has already written carry the
-- `_raw` key and are skipped. Safe to re-run: the whole script is a no-op once public.ops_applied
-- records it. The 2007-2008 Bear Stearns seed rows were authored on a 0-100 scale and are excluded.
--
-- INSPECT FIRST:
--   select count(*) filter (where score_components ? '_raw') as already, count(*) as total from risk_scores;
--   select max(score) from risk_scores where computed_at >= '2026-04-01';   -- expect <= 35 before, <= 90 after

create table if not exists public.ops_applied (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.ops_applied enable row level security;

create or replace function pg_temp.display_score(raw numeric) returns numeric
language sql immutable as $$
  select round((100 * (1 - exp(-greatest(raw, 0) / 16)))::numeric, 2)
$$;

do $$
declare
  n_scores bigint;
  n_snaps bigint;
  n_signals bigint;
begin
  if exists (select 1 from public.ops_applied where name = '08_rescale_scores') then
    raise notice 'ops/08 already applied; nothing to do';
    return;
  end if;

  update public.risk_scores
     set score_components = coalesce(score_components, '{}'::jsonb) || jsonb_build_object('_raw', score),
         score = pg_temp.display_score(score)
   where computed_at >= '2026-04-01'
     and not (coalesce(score_components, '{}'::jsonb) ? '_raw');
  get diagnostics n_scores = row_count;

  update public.daily_snapshots
     set score_components = coalesce(score_components, '{}'::jsonb) || jsonb_build_object('_raw', risk_score),
         risk_score = pg_temp.display_score(risk_score)
   where not (coalesce(score_components, '{}'::jsonb) ? '_raw');
  get diagnostics n_snaps = row_count;

  -- score_change is a difference of two scores: transform both ends, then subtract.
  update public.trading_signals
     set score_change = case
           when score_change is null then null
           else pg_temp.display_score(score_at_signal)
                - pg_temp.display_score(greatest(score_at_signal - score_change, 0))
         end,
         score_at_signal = pg_temp.display_score(score_at_signal)
   where score_at_signal is not null;
  get diagnostics n_signals = row_count;

  update public.positions set entry_score = pg_temp.display_score(entry_score) where entry_score is not null;
  update public.positions set exit_score = pg_temp.display_score(exit_score) where exit_score is not null;
  update public.alert_configs set threshold_score = pg_temp.display_score(threshold_score);
  update public.alert_history set triggered_score = pg_temp.display_score(triggered_score) where triggered_score is not null;

  insert into public.ops_applied (name) values ('08_rescale_scores');
  raise notice 'ops/08 applied: % risk_scores, % daily_snapshots, % trading_signals rescaled', n_scores, n_snaps, n_signals;
end $$;
