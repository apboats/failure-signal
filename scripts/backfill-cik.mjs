#!/usr/bin/env node
/**
 * ops/07: fill institutions.cik for active banks from the SEC's ticker list.
 *
 * EDGAR refuses requests whose User-Agent carries no contact address, so the
 * address comes from the environment and is never written into this repo:
 *
 *   SEC_EDGAR_EMAIL=you@example.com node scripts/backfill-cik.mjs            # dry run: prints the plan
 *   SEC_EDGAR_EMAIL=you@example.com node scripts/backfill-cik.mjs --apply    # runs the UPDATE via the CLI
 *
 * Only rows with a NULL cik are touched; existing CIKs are never overwritten.
 * Tickers are matched exactly (case-insensitive) against company_tickers.json,
 * so foreign listings that are not on a US exchange simply stay NULL.
 * --apply uses `npx supabase db query --remote --yes`, so the CLI must be
 * logged in and linked (`supabase link`).
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const email = (process.env.SEC_EDGAR_EMAIL ?? '').trim()
if (!email.includes('@')) {
  console.error('Set SEC_EDGAR_EMAIL to the contact address EDGAR should see.')
  process.exit(2)
}
const apply = process.argv.includes('--apply')

const headers = {
  'User-Agent': `FailureSignal/1.0 (${email})`,
  Accept: 'application/json',
}

const secRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
  headers,
})
if (!secRes.ok) {
  console.error(`SEC responded ${secRes.status}; nothing changed.`)
  process.exit(1)
}
const secJson = await secRes.json()
const cikByTicker = new Map()
for (const row of Object.values(secJson)) {
  if (row && typeof row.ticker === 'string' && row.cik_str !== undefined) {
    cikByTicker.set(
      row.ticker.toUpperCase(),
      String(row.cik_str).padStart(10, '0'),
    )
  }
}
console.log(`SEC list: ${cikByTicker.size} tickers`)

// Active institutions that still lack a CIK, read through the CLI (no DB password needed).
const query = (sql) =>
  JSON.parse(
    execFileSync(
      'npx',
      ['supabase', 'db', 'query', '--remote', '--read-only', '--output', 'json', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ),
  ).rows ?? []

const rows = query(
  "select id, ticker, name from institutions where is_active and cik is null and ticker is not null order by ticker",
)
const plan = []
const unmatched = []
for (const r of rows) {
  const cik = cikByTicker.get(String(r.ticker).toUpperCase())
  if (cik) plan.push({ ...r, cik })
  else unmatched.push(r.ticker)
}
console.log(`${rows.length} active banks without a CIK: ${plan.length} matched, ${unmatched.length} not on a US exchange`)
if (unmatched.length) console.log(`  unmatched: ${unmatched.join(', ')}`)
for (const p of plan) console.log(`  ${p.ticker.padEnd(6)} ${p.cik}  ${p.name}`)

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write these CIKs.')
  process.exit(0)
}
if (plan.length === 0) process.exit(0)

const values = plan
  .map((p) => `('${p.id}'::uuid, '${p.cik}')`)
  .join(',\n  ')
const sql = `update institutions i
set cik = v.cik, updated_at = now()
from (values
  ${values}
) as v(id, cik)
where i.id = v.id and i.cik is null;
select count(*) as with_cik from institutions where is_active and cik is not null;`
const dir = mkdtempSync(join(tmpdir(), 'cik-'))
const file = join(dir, 'backfill.sql')
writeFileSync(file, sql)
const out = execFileSync(
  'npx',
  ['supabase', 'db', 'query', '--remote', '--yes', '--output', 'json', '-f', file],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
)
console.log(out.trim())
