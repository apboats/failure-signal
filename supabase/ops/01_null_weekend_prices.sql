-- ONE-OFF: remove the prices that daily-snapshot copied onto non-trading days.
-- Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- WHY (F003): the cron ran 7 days a week and the Finnhub/Yahoo quote endpoints return Friday's close on
-- Saturday, Sunday and market holidays, so those rows got a real-looking price with a 0% "return".
-- Every event-study and lead-lag number treated them as trading days. WP12 makes daily-snapshot write
-- null prices on non-trading days; this script fixes the backlog so the `stock_price is not null` filter
-- in the Validation page yields a true trading-day series. Risk scores are kept; only price fields change.
--
-- AFTER RUNNING: invoke backfill-benchmarks once (POST .../functions/v1/backfill-benchmarks with the
-- service-role Authorization header) to refill XLF/SPY weekday rows for the last 3 months; it skips
-- weekends. Until then the Validation page simply has fewer benchmark dates.
--
-- Run the INSPECT block first and look at the numbers; then run the WRITE block.

-- =====================================================================================================
-- INSPECT
-- =====================================================================================================
-- Weekend rows that carry a price (live on 2026-11-18: the last 1,000 snapshots alone held 268).
select
  count(*) filter (where extract(isodow from snapshot_date) in (6, 7)) as weekend_priced_rows,
  count(*)                                                             as priced_rows_total,
  min(snapshot_date)                                                   as first_date,
  max(snapshot_date)                                                   as last_date
from daily_snapshots
where stock_price is not null;

select count(*) as weekend_benchmark_rows
from benchmark_snapshots
where extract(isodow from snapshot_date) in (6, 7);

-- Holiday candidates: weekday rows whose price AND change equal the previous priced row for the same
-- institution. A market holiday copies every priced bank (expect ~50 per date: 2026-05-25, 06-19, 07-03,
-- 09-07); a genuinely flat day shows one or two. Both are nulled by the write below; losing the odd
-- truly flat day is an accepted cost (it carries no information for the event study anyway).
with ordered as (
  select snapshot_date, institution_id, stock_price, stock_change_pct,
         lag(stock_price)      over (partition by institution_id order by snapshot_date) as prev_price,
         lag(stock_change_pct) over (partition by institution_id order by snapshot_date) as prev_change
  from daily_snapshots
  where stock_price is not null
    and extract(isodow from snapshot_date) between 1 and 5
)
select snapshot_date, count(*) as institutions_with_copied_price
from ordered
where stock_price = prev_price
  and stock_change_pct is not distinct from prev_change
group by snapshot_date
order by snapshot_date;

-- =====================================================================================================
-- WRITE
-- =====================================================================================================
begin;

-- 1. Weekends: null the price fields (keep the score row), delete the benchmark rows.
update daily_snapshots
set stock_price = null, stock_change_pct = null, volume = null
where stock_price is not null
  and extract(isodow from snapshot_date) in (6, 7);

delete from benchmark_snapshots
where extract(isodow from snapshot_date) in (6, 7);

-- 2. Holidays: with weekends already null, "previous row" means the previous trading day, so a weekday
--    row equal to it in both price and change is a copy. Same rule for the benchmarks, by ticker.
create temp table copied_rows on commit drop as
with ordered as (
  select id, stock_price, stock_change_pct,
         lag(stock_price)      over (partition by institution_id order by snapshot_date) as prev_price,
         lag(stock_change_pct) over (partition by institution_id order by snapshot_date) as prev_change
  from daily_snapshots
  where stock_price is not null
)
select id
from ordered
where stock_price = prev_price
  and stock_change_pct is not distinct from prev_change;

update daily_snapshots d
set stock_price = null, stock_change_pct = null, volume = null
from copied_rows c
where d.id = c.id;

create temp table copied_benchmarks on commit drop as
with ordered as (
  select id, price, change_pct,
         lag(price)      over (partition by ticker order by snapshot_date) as prev_price,
         lag(change_pct) over (partition by ticker order by snapshot_date) as prev_change
  from benchmark_snapshots
)
select id
from ordered
where price = prev_price
  and change_pct is not distinct from prev_change;

delete from benchmark_snapshots b
using copied_benchmarks c
where b.id = c.id;

-- VERIFY before committing: weekend_priced_rows and weekend_benchmark_rows must be 0;
-- copied_weekday_rows should be 0 or a handful.
select
  (select count(*) from daily_snapshots
     where stock_price is not null and extract(isodow from snapshot_date) in (6, 7)) as weekend_priced_rows,
  (select count(*) from benchmark_snapshots
     where extract(isodow from snapshot_date) in (6, 7))                             as weekend_benchmark_rows,
  (select count(*) from copied_rows)                                                  as nulled_weekday_rows,
  (select count(*) from copied_benchmarks)                                            as deleted_weekday_benchmarks;

commit;
