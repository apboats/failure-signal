# Failure Signal

Early-warning risk monitor for US bank stocks. A scheduled pipeline on Supabase ingests news, SEC
filings, insider and lawmaker trades, social sentiment and market prices for ~61 banks, turns them into
categorised risk signals, and compounds the signals into an hourly risk score per bank. A React console
shows which banks are heating up, whether the pipeline is alive, and whether the score has any
predictive value against the daily price series.

Agent-facing rules (traps, verification commands, file conventions) are in [CLAUDE.md](CLAUDE.md).

> **State of the SQL work.** `supabase/migrations/00003`–`00005` and every script under `supabase/ops/`
> are written but have **not** been applied to the live project, and nothing in this repository runs
> them. The frontend already works against the live schema as it is today (it falls back when the
> `latest_risk_scores` view is absent, pages every large read, and drops weekend rows client-side until
> `ops/01` has run). Apply them by hand in the order given in [Runbook](#runbook).

## Stack and layout

| Path                   | What lives there                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                 | React 19 + Vite 8 + Tailwind 4 + TanStack Query frontend. `pages/` compose the primitives in `components/ui` and `components/charts`; reads and writes live in `api/`, hooks in `queries/`, pure logic in `domain/`, tokens in `index.css`. |
| `shared/`              | `types.ts`, `constants.ts`, `thresholds.ts`: imported by both the browser and the Deno functions, so no Node, DOM or npm imports.                                                                                                           |
| `supabase/functions/`  | 12 Deno edge functions plus `_shared/` helpers (auth guard, env, thresholds mirror, http, Anthropic client, institution matcher, trading-signal rules).                                                                                     |
| `supabase/migrations/` | Schema as migration files, `00001`–`00005`.                                                                                                                                                                                                 |
| `supabase/ops/`        | One-off data repairs for the owner to run in the SQL editor. Never executed from the repo.                                                                                                                                                  |
| `supabase/config.toml` | Local CLI config; records `max_rows = 1000` and `verify_jwt = true` per function.                                                                                                                                                           |
| `netlify.toml`         | Build, SPA redirect and asset caching for the Netlify deploy.                                                                                                                                                                               |

Path aliases: `@/` is `src/`, `@shared/` is `shared/`.

## Routes

| Route              | Page        | Purpose                                                                                                                                         |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | Watchlist   | All active banks: score, 24h/7d deltas, 30-day sparkline, price, last-scored time; stat tiles, movers, latest signals, pipeline freshness pill. |
| `/institution/:id` | Institution | Score history, score components, signals (filterable, true totals), news.                                                                       |
| `/trading`         | Trading     | Trading signals (open/closed/all) and the positions book with realised and unrealised P&L. `?tab=positions`.                                    |
| `/validation`      | Validation  | Event study (does a score threshold crossing lead price?) and lead-lag per bank over the daily snapshots. `?tab=leadlag`.                       |
| `/alerts`          | Alerts      | Threshold alert configs and the alert_history log. In-app only; no email is sent.                                                               |
| `/playbook`        | Playbook    | SVB and Bear Stearns case studies replayed against the thresholds.                                                                              |

Old paths redirect: `/signals` and `/portfolio` go to `/trading`, `/backtest` and `/correlation` to
`/validation`, `/history` to `/playbook`. Unknown paths render Not found.

## Edge functions

All functions use the service-role client and are meant to be called only by pg_cron (or by hand with
the service-role key). Each handler starts with the `requireServiceRole` guard from
`supabase/functions/_shared/auth.ts`; the guard is fail-open until the `FN_AUTH_REQUIRED=true` secret is
set, so deploy order cannot stop the pipeline.

| Group         | Function                      | What it does                                                                                                                                           |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ingest        | `fetch-news`                  | GNews (primary) and optional NewsAPI queries per bank and broad sector queries; inserts `news_articles` (upsert on url once `ops/06` is applied).      |
| Ingest        | `fetch-market-data`           | Finnhub quotes during US market hours; `stock_drop` signals.                                                                                           |
| Ingest        | `fetch-sec-filings`           | EDGAR 10-K/10-Q by CIK, LLM extraction of equity, unrealised losses, deposits; `liquidity_warning` / `client_withdrawal` signals.                      |
| Ingest        | `fetch-insider-trades`        | EDGAR Form 4 by CIK; `insider_selling` signals.                                                                                                        |
| Ingest        | `fetch-lawmaker-trades`       | Congressional trade disclosures; `lawmaker_selling` signals. The upstream feed is unreliable (see deferred items).                                     |
| Ingest        | `fetch-social-sentiment`      | Social panic signals for the ten highest-scoring banks.                                                                                                |
| Process       | `process-articles`            | Drains `news_articles` where `analyzed_at is null` (15 per run) through Claude: relevance, sentiment, institution match, `risk_signals`.               |
| Process       | `analyze-news`                | **Removed.** Superseded by `process-articles`; the source directory is deleted and `config.toml` marks it `enabled = false`. Delete the deployed copy. |
| Score / alert | `compute-risk-score`          | Hourly: 30-day signals x severity x `scoring_weights`, exponential decay, one `risk_scores` row per bank per hour.                                     |
| Score / alert | `check-alerts`                | Hourly: compares latest scores with `alert_configs`, writes `alert_history`.                                                                           |
| Score / alert | `daily-snapshot`              | 22:00 UTC: one `daily_snapshots` row per bank (score + close price), XLF/SPY `benchmark_snapshots`, trading-signal generation.                         |
| Backfill      | `backfill-benchmarks`         | Manual: refills 3 months of XLF/SPY weekday rows. Run after `ops/01`.                                                                                  |
| Backfill      | `backfill-institution-prices` | Manual: refills missing weekday prices on `daily_snapshots`.                                                                                           |

## Data model

Migrations `00001` and `00002` are what the live project was created from. `00003`–`00005` codify what
was later added by hand plus the fixes from the 2026-11 review.

| Table                                 | Notes                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `institutions`                        | 196 rows, 61 active. `cik` is set on 11 of them (see `ops/07`). Uniqueness among active rows on `upper(ticker)` and on the punctuation-stripped name (`00004`).            |
| `news_articles`                       | Raw articles and their analysis; `analyzed_at is null` is the processing queue. Unique on `url` after `ops/06`.                                                            |
| `risk_signals`                        | Categorised, severity-rated events; `category` is the `signal_category` enum (13 values).                                                                                  |
| `risk_scores`                         | Hourly score per bank (~314k rows). Downsampled to one row per bank per day after 30 days by the `downsample-risk-scores` cron (`00004`).                                  |
| `daily_snapshots`                     | One row per bank per day: score, components, close price, change. Price fields are null on non-trading days. Unique `(institution_id, snapshot_date)`. Formerly live-only. |
| `benchmark_snapshots`                 | XLF and SPY closes by date. Unique `(ticker, snapshot_date)`. Formerly live-only.                                                                                          |
| `trading_signals`                     | `short_entry` / `short_exit` / `watch` events with the score and price at the time. Formerly live-only.                                                                    |
| `positions`                           | The operator's paper positions (entry/exit price, shares, open flag). Formerly live-only.                                                                                  |
| `alert_configs`, `alert_history`      | Threshold alerts and the log of crossings. `alert_configs.user_id` is nullable and unused.                                                                                 |
| `scoring_weights`                     | Per-category weights (`institution_id` null = global). Read-only through the API after `00004`.                                                                            |
| `insider_trades`, `sec_filings`       | Raw EDGAR extractions.                                                                                                                                                     |
| `latest_risk_scores` (view)           | One row per active bank with its newest score, or null if never scored (`00004`). The frontend uses it when present.                                                       |
| `snapshot_series(p_since)` (function) | Optional: the priced snapshot series as one jsonb value, immune to the row cap. The frontend does not depend on it.                                                        |

Scores are an index, not a percentage. Thresholds live in `shared/thresholds.ts` (mirrored in
`supabase/functions/_shared/thresholds.ts`, parity-tested): SHORT_EXIT 5, WATCH 8, SHORT_ENTRY 15,
SEVERE 25. The live distribution since April 2026 tops out at 33.5 with p90 around 8; the scoring formula
itself is unchanged by this upgrade (rescaling it is an owner decision, see deferred items).

## Secrets

The edge functions read exactly five secrets. Set them with `supabase secrets set KEY=value`;
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform and must not be set.

| Secret              | Read by                                                                | Required                                                         |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | `process-articles`, `fetch-sec-filings`                                | Yes, for any news-derived signal                                 |
| `FINNHUB_KEY`       | `fetch-market-data`, `daily-snapshot`                                  | Yes for market data; snapshots degrade to null prices without it |
| `GNEWS_API_KEY`     | `fetch-news` (primary, every run)                                      | Yes, for any news ingestion                                      |
| `NEWS_API_KEY`      | `fetch-news` (optional supplement for the broad queries)               | No                                                               |
| `SEC_EDGAR_EMAIL`   | `fetch-insider-trades`, `fetch-sec-filings` (EDGAR User-Agent contact) | Yes for EDGAR feeds                                              |

Optional switches, also set as secrets:

- `ANTHROPIC_MODEL`: model for the two LLM functions. Default `claude-sonnet-5-5` (a bulk extraction
  job); set `claude-opus-5-5` for higher-quality extraction at roughly twice the token price. Set it
  explicitly rather than relying on the compiled-in fallback in `supabase/functions/_shared/anthropic.ts`.
- `FN_AUTH_REQUIRED=true`: makes every function reject calls without the service-role Authorization
  header. Set only after `00005` is applied (step 6 of the runbook).

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`); the anon key
is public by design.

## Cron schedule

`supabase/migrations/00005_cron_jobs.sql` is the single source of truth for the schedule. It defines
`invoke_fn(name)`, which reads `project_url` and `service_role_key` from Vault and POSTs to the function
with a 150 s timeout, and it (re)schedules these ten jobs idempotently. The old `cron_*.sql` files are
gone. All times UTC.

| Job                      | Cadence                                | Calls                    |
| ------------------------ | -------------------------------------- | ------------------------ |
| `fetch-news`             | `0 * * * *` (hourly)                   | `fetch-news`             |
| `process-articles`       | `*/5 * * * *`                          | `process-articles`       |
| `compute-scores`         | `15 * * * *`                           | `compute-risk-score`     |
| `check-alerts`           | `20 * * * *`                           | `check-alerts`           |
| `fetch-market-data`      | `*/30 13-21 * * 1-5` (US market hours) | `fetch-market-data`      |
| `fetch-insider-trades`   | `0 10 * * *`                           | `fetch-insider-trades`   |
| `fetch-social-sentiment` | `0 */2 * * *`                          | `fetch-social-sentiment` |
| `fetch-sec-filings`      | `0 12 * * 1` (Mondays)                 | `fetch-sec-filings`      |
| `fetch-lawmaker-trades`  | `0 11 * * *`                           | `fetch-lawmaker-trades`  |
| `daily-snapshot`         | `0 22 * * *`                           | `daily-snapshot`         |

`00004` adds an eleventh, SQL-only job: `downsample-risk-scores` at `30 3 * * *`.

Check the last runs with `select jobname, status, return_message, start_time from cron.job_run_details
order by start_time desc limit 20;` and the functions' HTTP status codes in `net._http_response`
(kept for about six hours).

## Security model

There is no sign-in. The frontend uses the anon key, every table is readable by `anon`, and exactly two
tables are writable by `anon`: `positions` and `alert_configs`. `00004` section 7 writes this down as RLS
policies and removes the `to authenticated` / `auth.uid()` policies from `00001` that could never match.

**Owner decision to confirm:** the two `client writes ...` policies mean anyone with the public anon key
(it ships in the Netlify bundle) can insert, update and delete positions and alert configs. That is
acceptable only while this is a single-operator tool behind an unlisted URL. The alternatives are to
drop those two policies (the Trading and Alerts pages then cannot write) or to add auth and scope the
policies to `auth.uid()`. Do not reintroduce `to authenticated` read policies without adding auth.

Edge functions: `config.toml` records `verify_jwt = true` for every function, but the gateway check
accepts the anon key too; the in-function `requireServiceRole` guard (`FN_AUTH_REQUIRED=true`) is what
restricts callers to the service-role key. `invoke_fn` is `REVOKE`d from `anon` and `authenticated` so it
cannot be called through PostgREST's RPC endpoint.

## Local development

```sh
nvm use                      # Node 22 (.nvmrc)
npm ci
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
npm run check                # lint + typecheck + vitest + build; run before committing
```

The `supabase` CLI and `deno` are not required for frontend work and are not installed on the
development machine; the edge functions are deployed and their secrets set by the owner elsewhere. The
project in `.env.local` is production: never write to it from scripts or tests.

## Deploy (Netlify)

The root `netlify.toml` sets `npm run build`, publishes `dist/`, redirects every unknown path to
`index.html` (client-side routing) and marks `/assets/*` immutable. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the Netlify site settings. CI (`.github/workflows/ci.yml`) runs lint,
typecheck, test and build on every push; it does not deploy.

## PostgREST row cap

`max_rows` is 1000 on the live project and in `config.toml`. A supabase-js select without `.limit()` or
`.range()` is **silently truncated** to 1000 rows: `daily_snapshots` (~13k rows) and `risk_scores`
(~314k) exceed it, and `benchmark_snapshots` will in 2027. Every read in `src/api/` is therefore either
explicitly bounded or paged through `src/lib/fetchAll.ts` (range paging with a deterministic order plus
a tiebreak column). Counts shown in the UI come from `{ count: 'exact' }`, never from the page size.

## Runbook

Nothing below has been applied yet. Apply in this order; each step says where it runs. Migrations can be
pasted into the SQL editor in order, or pushed with the CLI (`supabase link`, then `supabase migration
list`; if `00001`/`00002` are not recorded as applied, `supabase migration repair --status applied 00001
00002`, then `supabase db push`). Pasting is fine for a single environment.

1. **`00003_enum_values.sql`** (SQL editor). No-op on production; required so `00004` can reference the
   enum values in a later transaction.
2. **`ops/02_merge_duplicate_institutions.sql`** (SQL editor). Run the INSPECT block, confirm the two
   groups (SAN, UCB) are the only active duplicates, then the WRITE block. Required before step 3.
3. **`00004_reconcile_live_schema.sql`** (SQL editor). Tables, indexes, active-row uniqueness,
   `scoring_weights` RLS and rows, the `latest_risk_scores` view, `snapshot_series`, the single-tenant
   RLS policies, the retention cron. Before trusting the weights, run
   `select count(*) from scoring_weights;` as postgres; if it is 0, re-run the inserts from `00001` and
   `00002` first.
4. **Vault secrets** (SQL editor, once per environment, never committed):
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');` and
   `select vault.create_secret('<service_role_key>', 'service_role_key');`.
5. **`00005_cron_jobs.sql`** (SQL editor). Replaces all ten jobs. Confirm with `cron.job_run_details`
   at the next hour that `compute-scores` still writes a `risk_scores` row.
6. **Enable function auth**: `supabase secrets set FN_AUTH_REQUIRED=true`, then redeploy with
   `supabase functions deploy` (no `--no-verify-jwt`; `config.toml` already says `verify_jwt = true`).
   Verify that an unauthenticated `POST .../functions/v1/compute-risk-score` now returns 401 and that
   the next cron run still succeeds. Delete the deployed `analyze-news` function.
7. **Data repairs**, each in the SQL editor, each with its INSPECT block first:
   - `ops/01_null_weekend_prices.sql`, then invoke `backfill-benchmarks` once by hand.
   - `ops/03_requeue_failed_articles.sql`, only after the fixed `process-articles` has run successfully.
   - `ops/04_deactivate_stale_trading_signals.sql`.
   - `ops/05_purge_risk_scores_initial.sql`, then `vacuum (analyze) risk_scores;` on its own.
   - `ops/06_dedupe_news_urls.sql` (creates the `news_articles_url_key` index).
   - `ops/07_backfill_cik.md` whenever convenient; it only enables the EDGAR feeds for more banks.

Every migration is idempotent and every ops script has a verification query before its `commit`, so a
failed step can be re-run after fixing the cause.

## Verification commands

| Command             | What it checks                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint over `src/`, `shared/`, `supabase/functions/`                                               |
| `npm run typecheck` | `tsc -b --noEmit`                                                                                  |
| `npm run test`      | Vitest: `fetchAll` paging, risk bands, thresholds parity, matcher, trading-signal rules, analytics |
| `npm run build`     | Vite production build with vendor chunking                                                         |
| `npm run check`     | All of the above                                                                                   |
| `npm run audit`     | `npm audit --omit=dev --audit-level=high`                                                          |
