# CLAUDE.md

Project-level instructions for agents working in this repository. The README has the full runbook; this
file is the list of traps that are not inferable from the code.

## Stack

- Frontend: React 19 + Vite 8 + Tailwind 4 + TanStack Query, in `src/`. Routes: `/`, `/institution/:id`,
  `/trading`, `/validation`, `/alerts`, `/playbook`.
- Backend: Supabase (Postgres + PostgREST) with 12 Deno edge functions under `supabase/functions/`.
  `supabase/functions/_shared/` holds the shared Deno helpers.
- `shared/` (`types.ts`, `constants.ts`, `thresholds.ts`) is imported by both sides. Keep that boundary
  browser- and Deno-safe: no Node, DOM or npm imports in `shared/`.
- Path aliases: `@/` is `src/`, `@shared/` is `shared/`. Use them instead of relative `../../` chains.

## Data access rules

- PostgREST `max_rows` is 1000 on the live project. A supabase-js select without `.limit()` or `.range()`
  is silently truncated. `daily_snapshots` has ~13k rows and `risk_scores` ~314k, so any read that can
  exceed 1000 rows goes through `src/lib/fetchAll.ts` (range paging with a deterministic order plus a
  tiebreak column). Never derive a count from the page size; use `{ count: 'exact' }`.
- `daily_snapshots`, `trading_signals`, `positions`, `benchmark_snapshots` and four `signal_category`
  values were created by hand on the live project. `supabase/migrations/00003`–`00005` codify them but
  have NOT been applied there yet, and nothing under `supabase/ops/` has been run. Until the owner
  applies them, the frontend must keep working against the live schema as it is today (for example the
  `latest_risk_scores` view may be absent, so the scores query falls back to a bounded `risk_scores`
  read).
- The `supabase` CLI and `deno` are NOT installed locally. Do not run `supabase ...` or `deno ...`
  commands; edge functions are deployed and secrets are set by the owner elsewhere.
- The project in `.env.local` is PRODUCTION, with a live hourly/daily pipeline and an anon key that can
  read every table and write `positions` / `alert_configs`. Never write to it from tooling, scripts,
  tests or ad-hoc curl: no inserts, updates, deletes or RPC calls. Read-only `GET`s with the anon key are
  fine for verification.

## Code conventions

- Pages compose the primitives in `src/components/ui` (PageHeader, Card, ListRow, Badge, StatTile,
  DataTable, PageState, ...) and the charts in `src/components/charts`. Pages do not import the
  Supabase client directly; reads and writes live in `src/api/*` and are consumed through the
  `src/queries/*` React Query hooks. Design tokens live in `src/index.css`; no raw hex colours or raw
  `slate-*` utilities in pages.
- Risk thresholds (SHORT_EXIT 5, WATCH 8, SHORT_ENTRY 15, SEVERE 25, SCORE_SPIKE 5) live in
  `shared/thresholds.ts` and are mirrored byte-for-byte in `supabase/functions/_shared/thresholds.ts`.
  A parity test fails `npm run test` if the two drift; change both or neither. Scores are an index
  (render `6.4`), never a percentage.
- Every edge function handler starts with the `requireServiceRole(req)` guard from `_shared/auth.ts`.
  It is fail-open until the `FN_AUTH_REQUIRED=true` secret is set, so deploy order cannot stop the
  pipeline.
- Schema changes are migration files under `supabase/migrations/` (idempotent: IF NOT EXISTS / OR
  REPLACE / DROP IF EXISTS). One-off data repairs are scripts under `supabase/ops/` with an INSPECT
  section before the WRITE section. Neither is ever executed from this repo.
- Copy is terse and factual: no exclamation marks, no "check back later"; state the measured window.

## Verification before committing

There is no pre-commit hook. Run `npm run check` (lint, typecheck, vitest, build) and fix everything it
reports. For a single package in a parallel wave use the narrow forms instead:
`npx eslint <files>`, `npx tsc -p tsconfig.app.json --noEmit`, `npx vitest run <paths>`.

Commit and push only when asked.
