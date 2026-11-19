/**
 * classify-pending: hourly. Estimates how likely each discovered institution
 * is to be a US bank, so the Review page can sort the queue.
 *
 * For every row with discovered_at set and no estimate yet (plus any row
 * passed as { "institution_id": ... } to re-check one), it finds the company
 * in sec_company_tickers (by ticker, then by normalised name), reads its
 * EDGAR submissions record for the industry code, exchanges and business
 * address, and stores the result of classifyInstitution() in
 * us_bank_probability and review_evidence. A CIK found this way is also saved
 * when the row has none, so an approved bank is covered by the EDGAR feeds
 * straight away.
 *
 * It never changes is_active or review_status: approving is a human decision.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, requireServiceRole } from '../_shared/auth.ts'
import {
  classifyInstitution,
  normalizeCompanyName,
  type SecRecord,
} from '../_shared/bankClassifier.ts'
import { optionalEnv } from '../_shared/env.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Rows per run; the queue is normally a handful a day. */
const BATCH = 40
/** SEC fair-access limit is 10 requests/second. */
const PACE_MS = 200

interface CandidateRow {
  id: string
  name: string
  ticker: string | null
  sector: string | null
  cik: string | null
}

interface TickerEntry {
  cik: string
  ticker: string
  title: string
}

function secUserAgent(): string {
  const email = optionalEnv(
    'SEC_EDGAR_EMAIL',
    'EDGAR User-Agent falls back to a placeholder contact; SEC may throttle or block requests without a real address',
  )
  return `FailureSignal ${email ?? 'admin@failuresignal.app'}`
}

/**
 * Finds the SEC registrant for a candidate in sec_company_tickers (migration
 * 00007): by ticker first, then by normalised company name. The table is a
 * local copy because www.sec.gov rate-limits Supabase's shared servers.
 */
async function findTickerEntry(
  ticker: string | null,
  name: string,
): Promise<{ entry: TickerEntry; matchedBy: 'ticker' | 'name' } | null> {
  if (ticker) {
    const { data, error } = await supabase
      .from('sec_company_tickers')
      .select('cik, ticker, title')
      .eq('ticker', ticker)
      .limit(1)
    if (error) throw error
    if (data && data.length > 0)
      return { entry: data[0] as TickerEntry, matchedBy: 'ticker' }
  }
  const key = normalizeCompanyName(name)
  if (!key) return null
  const { data, error } = await supabase
    .from('sec_company_tickers')
    .select('cik, ticker, title')
    .eq('normalized_title', key)
    .order('ticker')
    .limit(1)
  if (error) throw error
  return data && data.length > 0
    ? { entry: data[0] as TickerEntry, matchedBy: 'name' }
    : null
}

async function loadSecRecord(
  cik: string,
  userAgent: string,
): Promise<SecRecord | null> {
  const res = await fetchWithRetry(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
    { headers: { 'User-Agent': userAgent, Accept: 'application/json' } },
    { label: `sec submissions ${cik}` },
  )
  if (!res.ok) return null
  const body = (await res.json()) as {
    sic?: string
    sicDescription?: string
    exchanges?: (string | null)[]
    addresses?: { business?: { stateOrCountry?: string | null } }
  }
  return {
    cik,
    sic: body.sic ? String(body.sic) : null,
    sicDescription: body.sicDescription ?? null,
    exchanges: (body.exchanges ?? []).filter(
      (e): e is string => typeof e === 'string' && e.length > 0,
    ),
    stateOrCountry: body.addresses?.business?.stateOrCountry ?? null,
  }
}

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    const { institution_id } = await req
      .json()
      .catch(() => ({ institution_id: null }))

    let query = supabase
      .from('institutions')
      .select('id, name, ticker, sector, cik')
      .not('discovered_at', 'is', null)
    query = institution_id
      ? query.eq('id', institution_id)
      : query.is('us_bank_probability', null)
    const { data: rows, error } = await query
      .order('discovered_at', { ascending: false })
      .limit(BATCH)
    if (error) throw error
    const candidates = (rows ?? []) as CandidateRow[]
    if (candidates.length === 0) return json({ success: true, classified: 0 })

    const { count: listed, error: countError } = await supabase
      .from('sec_company_tickers')
      .select('ticker', { count: 'exact', head: true })
    if (countError) throw countError
    if (!listed) {
      return json(
        {
          error:
            'sec_company_tickers is empty: run scripts/refresh-sec-tickers.mjs (see README)',
        },
        500,
      )
    }

    const userAgent = secUserAgent()
    const results: Array<Record<string, unknown>> = []
    for (const row of candidates) {
      const ticker = row.ticker?.trim().toUpperCase() || null
      const found = await findTickerEntry(ticker, row.name)
      const entry = found?.entry
      const matchedBy = found?.matchedBy ?? null

      const sec = entry ? await loadSecRecord(entry.cik, userAgent) : null
      if (entry) await sleep(PACE_MS)
      const result = classifyInstitution({
        name: row.name,
        ticker,
        sector: row.sector,
        sec,
        matchedBy: sec ? matchedBy : null,
      })

      const evidence = {
        checked_at: new Date().toISOString(),
        matched_by: sec ? matchedBy : null,
        sec_name: entry?.title ?? null,
        cik: sec?.cik ?? null,
        sic: sec?.sic ?? null,
        sic_description: sec?.sicDescription ?? null,
        exchanges: sec?.exchanges ?? [],
        state_or_country: sec?.stateOrCountry ?? null,
        reasons: result.reasons,
      }
      const patch: Record<string, unknown> = {
        us_bank_probability: result.probability,
        review_evidence: evidence,
      }
      if (!row.cik && sec?.cik) patch.cik = sec.cik

      const { error: updateError } = await supabase
        .from('institutions')
        .update(patch)
        .eq('id', row.id)
      if (updateError) {
        console.error(
          `[classify-pending] update failed for ${row.name}: ${updateError.message}`,
        )
        results.push({ institution: row.name, error: updateError.message })
        continue
      }
      results.push({
        institution: row.name,
        ticker,
        probability: result.probability,
        sic: evidence.sic,
      })
    }

    return json({ success: true, classified: results.length, results })
  } catch (error) {
    console.error('classify-pending failed:', error)
    return json({ error: String(error) }, 500)
  }
})
