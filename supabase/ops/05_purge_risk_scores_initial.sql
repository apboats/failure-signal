-- ONE-OFF: initial purge of hourly risk_scores older than 30 days, keeping one row per institution per
-- UTC day. Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- WHY (F044): compute-risk-score appends ~61 rows an hour (~535k/year) that nothing reads after a day;
-- daily_snapshots already keeps one score per institution per day. The retention cron
-- `downsample-risk-scores` in supabase/migrations/00004 applies the same rule every night, but its first
-- pass would be a single ~260k-row delete. This script does that first pass in 7-day batches instead.
-- The Bear Stearns seed rows (2007-2008) are one per date and therefore survive.
--
-- Live on 2026-11-18: 314,698 rows, 270,656 older than 30 days; ~61 institutions x ~190 days ~ 12k rows
-- will remain from that range.
--
-- Row locks taken by DELETE do not block the hourly inserts, but the loop is one transaction, so run it
-- at a quiet time (any minute except :15, when compute-scores runs) and expect it to take a few minutes.

-- INSPECT FIRST
select
  count(*)                                                          as total_rows,
  count(*) filter (where computed_at < now() - interval '30 days')  as older_than_30d,
  min(computed_at)                                                  as oldest,
  pg_size_pretty(pg_total_relation_size('risk_scores'))             as table_size
from risk_scores;

-- How many rows the rule would remove (same window function as the write below):
select count(*) as rows_to_delete
from (
  select row_number() over (
           partition by institution_id, (computed_at at time zone 'utc')::date
           order by computed_at desc) as rn
  from risk_scores
  where computed_at < now() - interval '30 days'
) t
where rn > 1;

-- WRITE: batched by 7-day window, oldest first. Each window is its own DELETE statement; progress is
-- reported with RAISE NOTICE (visible in the SQL editor's "Messages" / results pane).
do $$
declare
  -- windows are aligned to UTC midnight so a UTC date never straddles two windows (the keep-one-per-day
  -- rule is evaluated per window, so a split day would keep two rows)
  cutoff timestamptz := date_trunc('day', (now() - interval '30 days') at time zone 'utc') at time zone 'utc';
  lo timestamptz;
  hi timestamptz;
  n bigint;
  total bigint := 0;
begin
  select date_trunc('day', min(computed_at) at time zone 'utc') at time zone 'utc'
  into lo
  from risk_scores
  where computed_at < cutoff;
  if lo is null then
    raise notice 'nothing older than 30 days';
    return;
  end if;

  while lo < cutoff loop
    hi := least(lo + interval '7 days', cutoff);

    delete from risk_scores r
    using (
      select id
      from (
        select id,
               row_number() over (
                 partition by institution_id, (computed_at at time zone 'utc')::date
                 order by computed_at desc) as rn
        from risk_scores
        where computed_at >= lo and computed_at < hi
      ) w
      where rn > 1
    ) d
    where r.id = d.id;

    get diagnostics n = row_count;
    total := total + n;
    raise notice 'window % .. %: deleted % rows (running total %)',
      (lo at time zone 'utc')::date, (hi at time zone 'utc')::date, n, total;
    lo := hi;
  end loop;

  raise notice 'done: deleted % rows', total;
end $$;

-- AFTER the DO block finishes, run this on its own (VACUUM cannot run inside a transaction block, and the
-- SQL editor wraps multi-statement submissions in one):
-- vacuum (analyze) risk_scores;

-- VERIFY
select
  count(*) as total_rows,
  count(*) filter (where computed_at < now() - interval '30 days') as older_than_30d,
  pg_size_pretty(pg_total_relation_size('risk_scores')) as table_size
from risk_scores;
