select cron.schedule('fetch-news', '0 * * * *',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-news',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);

select cron.schedule('compute-scores', '15 * * * *',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/compute-risk-score',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);

select cron.schedule('check-alerts', '20 * * * *',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/check-alerts',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);

select cron.schedule('fetch-market-data', '*/30 13-21 * * 1-5',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-market-data',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);
