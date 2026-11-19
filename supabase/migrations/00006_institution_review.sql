-- 00006: review queue for institutions found by the news pipeline.
--
-- process-articles creates a row for every company the model names that matches nothing already
-- tracked. Until 2026-11-19 those rows were created active, which is how Upstart, Coinbase, Block,
-- VanEck and Paytm reached the Watchlist. They are now created inactive with review_status
-- 'pending'; classify-pending estimates how likely each one is to be a US bank from its SEC record,
-- and the Review page in the app tracks or ignores it.
--
-- Idempotent: every statement uses IF NOT EXISTS / OR REPLACE or guards on existing values.

-- =====================================================================================================
-- 1. Columns
-- =====================================================================================================
alter table institutions add column if not exists discovered_at timestamptz;
alter table institutions add column if not exists review_status text;
alter table institutions add column if not exists reviewed_at timestamptz;
-- 0..1 heuristic from the SEC industry code, exchange and headquarters (see classify-pending).
alter table institutions add column if not exists us_bank_probability numeric(4, 3);
-- What the estimate was based on: cik, sic, sic_description, exchanges, state, matched_by, reasons[].
alter table institutions add column if not exists review_evidence jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'institutions_review_status_check') then
    alter table institutions
      add constraint institutions_review_status_check
      check (review_status is null or review_status in ('pending', 'approved', 'ignored'));
  end if;
end $$;

create index if not exists idx_institutions_review
  on institutions (review_status, discovered_at desc)
  where discovered_at is not null;

-- =====================================================================================================
-- 2. Backfill (only rows that have never been reviewed)
-- =====================================================================================================
-- Rows created after the April seed were auto-discovered; earlier rows were seeded by hand.
-- The eight companies deactivated on 2026-11-19 as non-banks or non-US banks are marked discovered
-- too, so they appear under "Ignored" and can be restored from the app.
update institutions
set discovered_at = created_at
where discovered_at is null
  and (
    created_at >= '2026-05-01'
    or ticker in ('UPST', 'COIN', 'PAYTM', 'VanEck', 'MRX', 'AEG', 'PTSB', 'BIRG')
  );

-- Block (XYZ) was auto-created active on 2026-11-19 by the previous process-articles build, minutes
-- before the inactive-by-default change shipped. It goes back to the queue like any new discovery.
update institutions
set is_active = false, review_status = 'pending', updated_at = now()
where review_status is null
  and discovered_at >= '2026-11-19'
  and ticker = 'XYZ';

-- Everything else keeps its current state: active rows are approved, inactive rows ignored.
update institutions
set review_status = case when is_active then 'approved' else 'ignored' end
where review_status is null;

-- =====================================================================================================
-- 3. The one write the app may make on institutions
-- =====================================================================================================
-- The app has no auth (single-tenant, see 00004), so anon can call this. It is deliberately narrow:
-- only rows the pipeline discovered can be changed, and only between pending / approved / ignored.
-- Hand-seeded banks (discovered_at is null) cannot be switched off from the browser.
create or replace function public.review_institution(p_id uuid, p_decision text)
returns table (id uuid, is_active boolean, review_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_decision not in ('track', 'ignore', 'pending') then
    raise exception 'decision must be track, ignore or pending, got %', p_decision
      using errcode = '22023';
  end if;

  return query
  update institutions i
  set is_active     = (p_decision = 'track'),
      review_status = case p_decision
                        when 'track' then 'approved'
                        when 'ignore' then 'ignored'
                        else 'pending'
                      end,
      reviewed_at   = case when p_decision = 'pending' then null else now() end,
      updated_at    = now()
  where i.id = p_id
    and i.discovered_at is not null
  returning i.id, i.is_active, i.review_status;

  if not found then
    raise exception 'institution % is not a discovered candidate', p_id
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.review_institution(uuid, text) from public;
grant execute on function public.review_institution(uuid, text) to anon, authenticated, service_role;

-- =====================================================================================================
-- 4. Schedule the classifier (hourly, after process-articles has had a few runs)
-- =====================================================================================================
do $$
declare
  existing bigint;
begin
  select jobid into existing from cron.job where jobname = 'classify-pending';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;
  perform cron.schedule('classify-pending', '40 * * * *', $job$select public.invoke_fn('classify-pending')$job$);
end $$;
