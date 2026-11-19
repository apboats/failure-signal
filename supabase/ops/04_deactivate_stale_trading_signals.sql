-- ONE-OFF: deactivate trading_signals rows the old generator should never have emitted.
-- Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- WHY (F018): daily-snapshot used to emit short_entry on any +5 jump with no level check (16 of 29
-- entries are below the documented SHORT_ENTRY threshold of 15, the lowest at 5), and short_exit whenever
-- the score fell under 5 even when no short_entry existed. The Trading page showed "short at 5, cover at
-- 4.9" cards and contradictory entries/exits for the same bank. WP12 fixes the generator (shared
-- thresholds, one signal per type per run, exit only against an open entry); this cleans the backlog.
-- Rows are deactivated, never deleted, so the backtest event set is unchanged (it reads daily_snapshots).
--
-- Thresholds mirror shared/thresholds.ts: SHORT_ENTRY = 15.

-- INSPECT FIRST (live on 2026-11-18: 34 active rows, 8 active short_entry below 15, 4 orphan short_exit).
select signal_type, count(*) as active_rows,
       count(*) filter (where signal_type = 'short_entry' and score_at_signal < 15) as below_threshold
from trading_signals
where is_active
group by signal_type
order by signal_type;

-- Orphan exits: an active short_exit with no short_entry (active or not) for the same bank created before it.
select x.id, x.institution_id, i.ticker, x.score_at_signal, x.created_at, x.reason
from trading_signals x
join institutions i on i.id = x.institution_id
where x.is_active
  and x.signal_type = 'short_exit'
  and not exists (
    select 1 from trading_signals e
    where e.institution_id = x.institution_id
      and e.signal_type = 'short_entry'
      and e.created_at < x.created_at
  )
order by x.created_at;

-- WRITE
begin;

-- 1. short_entry below the entry threshold
update trading_signals
set is_active = false
where is_active
  and signal_type = 'short_entry'
  and score_at_signal < 15;

-- 2. short_exit with no prior short_entry for the same institution
update trading_signals x
set is_active = false
where x.is_active
  and x.signal_type = 'short_exit'
  and not exists (
    select 1 from trading_signals e
    where e.institution_id = x.institution_id
      and e.signal_type = 'short_entry'
      and e.created_at < x.created_at
  );

-- VERIFY before committing: no active sub-threshold entries, no active orphan exits.
select
  count(*) filter (where signal_type = 'short_entry' and score_at_signal < 15) as active_entries_below_threshold,
  count(*) filter (where signal_type = 'short_exit' and not exists (
      select 1 from trading_signals e
      where e.institution_id = trading_signals.institution_id
        and e.signal_type = 'short_entry'
        and e.created_at < trading_signals.created_at)) as active_orphan_exits,
  count(*) as active_total
from trading_signals
where is_active;

commit;
