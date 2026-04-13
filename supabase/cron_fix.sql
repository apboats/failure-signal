SELECT cron.unschedule('fetch-news');
SELECT cron.unschedule('compute-scores');
SELECT cron.unschedule('check-alerts');
SELECT cron.unschedule('fetch-market-data');
SELECT cron.unschedule('fetch-insider-trades');
SELECT cron.unschedule('fetch-social-sentiment');
SELECT cron.unschedule('fetch-sec-filings');
SELECT cron.unschedule('fetch-lawmaker-trades');
SELECT cron.unschedule('process-articles');
SELECT cron.unschedule('daily-snapshot');

SELECT cron.schedule('fetch-news', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-news',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('process-articles', '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/process-articles',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('compute-scores', '15 * * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/compute-risk-score',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('check-alerts', '20 * * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/check-alerts',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('fetch-market-data', '*/30 13-21 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-market-data',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('fetch-insider-trades', '0 10 * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-insider-trades',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('fetch-social-sentiment', '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-social-sentiment',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('fetch-sec-filings', '0 12 * * 1',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-sec-filings',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('fetch-lawmaker-trades', '0 11 * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-lawmaker-trades',
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule('daily-snapshot', '0 22 * * *',
  $$SELECT net.http_post(
    url := 'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/daily-snapshot',
    body := '{}'::jsonb
  )$$
);
