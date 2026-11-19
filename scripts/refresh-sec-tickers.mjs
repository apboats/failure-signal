#!/usr/bin/env node --experimental-strip-types
/**
 * Loads the SEC ticker list into sec_company_tickers (migration 00007).
 *
 * www.sec.gov rate-limits Supabase's shared servers, so this runs from a normal
 * machine. EDGAR requires a contact address in the User-Agent; it comes from
 * the environment and is never stored in the repo:
 *
 *   SEC_EDGAR_EMAIL=you@example.com node --experimental-strip-types scripts/refresh-sec-tickers.mjs
 *
 * Uses `npx supabase db query --remote --yes`, so the CLI must be logged in and
 * linked. Upserts every ticker; safe to re-run. Refresh monthly.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeCompanyName } from '../supabase/functions/_shared/bankClassifier.ts'

const email = (process.env.SEC_EDGAR_EMAIL ?? '').trim()
if (!email.includes('@')) {
  console.error('Set SEC_EDGAR_EMAIL to the contact address EDGAR should see.')
  process.exit(2)
}

const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
  headers: {
    'User-Agent': `FailureSignal ${email}`,
    Accept: 'application/json',
  },
})
if (!res.ok) {
  console.error(`SEC responded ${res.status}; nothing changed.`)
  process.exit(1)
}
const rows = Object.values(await res.json())
  .filter((r) => r && typeof r.ticker === 'string' && r.cik_str !== undefined)
  .map((r) => ({
    ticker: r.ticker.toUpperCase(),
    cik: String(r.cik_str).padStart(10, '0'),
    title: String(r.title),
  }))
console.log(`SEC list: ${rows.length} tickers`)

const quote = (s) => `'${s.replace(/'/g, "''")}'`
const seen = new Set()
const values = []
for (const r of rows) {
  if (seen.has(r.ticker)) continue
  seen.add(r.ticker)
  values.push(
    `(${quote(r.ticker)}, ${quote(r.cik)}, ${quote(r.title)}, ${quote(normalizeCompanyName(r.title))})`,
  )
}

const dir = mkdtempSync(join(tmpdir(), 'sec-tickers-'))
const file = join(dir, 'upsert.sql')
writeFileSync(
  file,
  `insert into sec_company_tickers (ticker, cik, title, normalized_title)
values
${values.join(',\n')}
on conflict (ticker) do update
  set cik = excluded.cik, title = excluded.title,
      normalized_title = excluded.normalized_title, updated_at = now();
select count(*) as tickers from sec_company_tickers;
`,
)
const out = execFileSync(
  'npx',
  [
    'supabase',
    'db',
    'query',
    '--remote',
    '--yes',
    '--output',
    'json',
    '-f',
    file,
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
)
console.log(out.trim())
