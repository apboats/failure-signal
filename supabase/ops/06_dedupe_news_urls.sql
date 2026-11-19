-- ONE-OFF: remove duplicate news_articles by url, then enforce uniqueness.
-- Run by hand in the Supabase SQL editor (service role). Not a migration.
--
-- WHY (F074): fetch-news did select-then-insert with no unique index, so concurrent runs could insert
-- the same URL twice (double analysis, duplicate signals). The upgraded fetch-news upserts with
-- `onConflict: 'url', ignoreDuplicates: true`, which needs a NON-partial unique index on url (PostgREST
-- cannot pass a partial-index predicate for ON CONFLICT inference). NULL urls never conflict, so a plain
-- index on (url) is correct; the live table has no empty-string urls.
--
-- The matching statement in supabase/migrations/00004_reconcile_live_schema.sql is commented out and
-- points here: creating the index before deduping fails with a unique violation.
--
-- Keeps the OLDEST row of each duplicate group (its risk_signals and analysis are the originals) and
-- re-points any risk_signals that reference a deleted duplicate, so nothing is orphaned.

-- INSPECT FIRST
select url, count(*) as copies, min(created_at) as first_seen, max(created_at) as last_seen
from news_articles
where url is not null
group by url
having count(*) > 1
order by copies desc, first_seen
limit 50;

select count(*) as duplicate_rows_to_delete
from (
  select row_number() over (partition by url order by created_at, id) as rn
  from news_articles
  where url is not null
) t
where rn > 1;

-- WRITE
begin;

create temp table news_dupes on commit drop as
select id as loser_id,
       first_value(id) over (partition by url order by created_at, id) as keep_id
from news_articles
where url is not null;

delete from news_dupes where loser_id = keep_id;

-- keep signal links intact
update risk_signals s
set news_article_id = d.keep_id
from news_dupes d
where s.news_article_id = d.loser_id;

delete from news_articles a
using news_dupes d
where a.id = d.loser_id;

create unique index if not exists news_articles_url_key on news_articles (url);

-- VERIFY before committing: must be 0
select count(*) as remaining_duplicates
from (select url from news_articles where url is not null group by url having count(*) > 1) t;

commit;
