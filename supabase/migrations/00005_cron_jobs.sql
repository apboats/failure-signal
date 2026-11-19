-- 00005: the authoritative cron schedule.
--
-- Replaces supabase/cron_setup.sql, supabase/cron_new_sources.sql and supabase/cron_fix.sql (all deleted).
-- The first two used an `extensions.http(...)` cast that does not exist, so every job failed silently;
-- the third worked but hard-coded the project URL ten times, sent no Authorization header, used the
-- 5 s pg_net default timeout, and aborted on a fresh project because unscheduling a job by name errors
-- when the job is missing. None of them lived under migrations, so a new environment had no pipeline.
--
-- BEFORE APPLYING, once per environment, in the SQL editor (never commit these values):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- Check: select name from vault.decrypted_secrets where name in ('project_url', 'service_role_key');
--
-- AFTER APPLYING: set FN_AUTH_REQUIRED=true (supabase secrets set) and redeploy the functions with
-- verify_jwt = true (recorded in supabase/config.toml). Doing that BEFORE this migration stops the whole
-- pipeline, because the old jobs send no Authorization header. The functions' guard is fail-open until
-- FN_AUTH_REQUIRED is set, so applying this file first is always safe.
--
-- Re-runnable: each job is unscheduled by jobid when present, then scheduled again.
-- Verify after the next hour: select jobname, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 20;
-- and net._http_response (kept ~6 h) for the functions' real HTTP status codes.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

-- One place that knows how to call an edge function. URL and key come from Vault, so this file holds no
-- project reference and works unchanged on staging, local and production.
create or replace function public.invoke_fn(fn text) returns bigint
language sql
set search_path = public
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000   -- edge functions run up to 150 s; the 5 s default recorded every run as a client timeout
  );
$$;

-- PostgREST exposes every function in `public` as an RPC and Supabase grants EXECUTE to anon/authenticated
-- by default. This function holds the service-role key, so the API roles must never be able to call it.
revoke execute on function public.invoke_fn(text) from public, anon, authenticated;

do $$
declare
  j record;
begin
  for j in
    select *
    from (values
      ('fetch-news',             '0 * * * *',          'fetch-news'),
      ('process-articles',       '*/5 * * * *',        'process-articles'),
      ('compute-scores',         '15 * * * *',         'compute-risk-score'),
      ('check-alerts',           '20 * * * *',         'check-alerts'),
      ('fetch-market-data',      '*/30 13-21 * * 1-5', 'fetch-market-data'),
      ('fetch-insider-trades',   '0 10 * * *',         'fetch-insider-trades'),
      ('fetch-social-sentiment', '0 */2 * * *',        'fetch-social-sentiment'),
      ('fetch-sec-filings',      '0 12 * * 1',         'fetch-sec-filings'),
      ('fetch-lawmaker-trades',  '0 11 * * *',         'fetch-lawmaker-trades'),
      ('daily-snapshot',         '0 22 * * *',         'daily-snapshot')
    ) as v(job_name, schedule, fn)
  loop
    -- unschedule by jobid: a no-op when the job does not exist (unscheduling by name would raise)
    perform cron.unschedule(jobid) from cron.job where jobname = j.job_name;
    perform cron.schedule(j.job_name, j.schedule, format('select public.invoke_fn(%L)', j.fn));
  end loop;
end $$;
