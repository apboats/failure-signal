-- ONE-OFF: re-queue news articles whose analysis failed because of the retired model id.
-- Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- WHY: from 2026-10-28 process-articles called a model id that no longer exists; every article got
-- analyzed_at = now() and summary = '[Analysis failed: ...]' and was never retried (F004). Nulling
-- analyzed_at puts them back in the `analyzed_at is null` queue that process-articles drains, 15 per
-- 5-minute run (~180/hour).
--
-- RUN ONLY AFTER the fixed process-articles (shared/_shared/anthropic.ts, current model id) is deployed
-- and has succeeded at least once, or the same rows will fail again and be re-marked.
--
-- INSPECT FIRST (live on 2026-11-18: 2,543 failed in total, 442 published in the last 30 days):
select
  count(*)                                                                 as failed_total,
  count(*) filter (where published_at >= now() - interval '30 days')       as failed_last_30d,
  min(published_at)                                                        as oldest_failed,
  max(published_at)                                                        as newest_failed
from news_articles
where summary like '[Analysis failed%';

-- Last successful analysis, to confirm the deployed function works before re-queueing:
select max(analyzed_at) as last_successful_analysis
from news_articles
where analyzed_at is not null and (summary is null or summary not like '[Analysis failed%');

-- WRITE: the last 30 days (restores the live score; ~3 hours of processing at 180/hour).
update news_articles
set analyzed_at = null, summary = null
where summary like '[Analysis failed%'
  and published_at >= now() - interval '30 days';

-- FULL RESET VARIANT (commented out): all 2,543 rows, ~14 hours of processing and roughly $10 of model
-- spend. Worth it to backfill the daily_snapshots / backtest history since 2026-06-15, because
-- signal_date is taken from published_at so historical signals land on the right dates.
-- update news_articles
-- set analyzed_at = null, summary = null
-- where summary like '[Analysis failed%';

-- VERIFY: the queue should now be non-empty and shrink by ~15 every 5 minutes.
select count(*) as queued from news_articles where analyzed_at is null;
