select cron.schedule('fetch-insider-trades', '0 10 * * *',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-insider-trades',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);

select cron.schedule('fetch-social-sentiment', '0 */2 * * *',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-social-sentiment',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);

select cron.schedule('fetch-sec-filings', '0 12 * * 1',
  $$select extensions.http((
    'POST',
    'https://xdoobxoyrsvksrotyvnt.supabase.co/functions/v1/fetch-sec-filings',
    ARRAY[extensions.http_header('Content-Type','application/json')],
    'application/json',
    '{}'
  )::extensions.http_request)$$
);
