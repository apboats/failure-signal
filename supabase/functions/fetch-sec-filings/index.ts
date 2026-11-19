/**
 * fetch-sec-filings: for every active institution with a CIK, finds the
 * latest 10-Q/10-K on EDGAR, extracts balance-sheet distress markers with
 * Claude (model and request shape in _shared/anthropic.ts) and writes a
 * sec_filings row plus liquidity_warning / client_withdrawal signals dated
 * on the filing date.
 *
 * Foreign private issuers (BCS, DB, TD, UBS, ...) file 20-F/40-F in their
 * home-country GAAP and currency, which the USD-millions prompt would
 * misread; they are skipped with a log line rather than analysed. Only 11 of
 * the 61 active banks carry a CIK today: supabase/ops/07_backfill_cik.md.
 *
 * Failure handling mirrors process-articles: a request-independent error
 * (retired model, bad key, quota, outage, DB connectivity) stops the run and
 * returns 500/429 with the results so far; a filing-specific one (schema or
 * JSON failure, refusal, max_tokens, BadRequestError) is recorded for that
 * institution and the loop continues. Nothing is written for a failed
 * filing, so it is retried on the next weekly run.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { json, requireServiceRole } from '../_shared/auth.ts'
import { optionalEnv } from '../_shared/env.ts'
import { fetchWithRetry, sleep } from '../_shared/http.ts'
import {
  abortStatus,
  analyzeJson,
  describeError,
  getClient,
  isRequestIndependentError,
  MODEL,
} from '../_shared/anthropic.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// EDGAR requires a descriptive User-Agent with a contact address and asks for
// at most 10 requests per second; the per-institution sleeps keep well under.
const SEC_USER_AGENT = `FailureSignal ${
  optionalEnv(
    'SEC_EDGAR_EMAIL',
    'EDGAR requests carry a placeholder contact; set a real address',
  ) ?? 'admin@failuresignal.app'
}`

const SEC_HEADERS = { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' }

const ANALYSIS_PROMPT = `You are a financial analyst examining a bank's SEC quarterly or annual filing (10-Q or 10-K) for early warning signs of institutional failure, based on patterns from the Silicon Valley Bank collapse.

You are given excerpts of the filing around the relevant disclosures. Extract these values if present:
- total_equity: total stockholders' equity in millions USD
- unrealized_losses_afs: unrealized losses on available-for-sale securities in millions USD (positive number for losses)
- unrealized_losses_htm: unrealized losses on held-to-maturity securities in millions USD (positive number for losses)
- total_deposits: total deposits in millions USD
- uninsured_deposits_pct: percentage of deposits exceeding the FDIC insurance limit, 0 to 100 (if disclosed; compute from the estimated uninsured amount and total deposits when both are given)
- deposit_change_pct: quarter-over-quarter change in total deposits as a percentage (negative = decline), only when both periods are stated
- concentration_notes: any mention of deposit concentration in specific industries or sectors

Values stated in thousands or billions must be converted to millions. If a value is not found in the excerpts, use null rather than guessing.`

const FilingSchema = z.object({
  total_equity: z.number().nullable(),
  unrealized_losses_afs: z.number().nullable(),
  unrealized_losses_htm: z.number().nullable(),
  total_deposits: z.number().nullable(),
  uninsured_deposits_pct: z.number().nullable(),
  deposit_change_pct: z.number().nullable(),
  concentration_notes: z.string().nullable(),
})

type FilingAnalysis = z.infer<typeof FilingSchema>

interface FilingInfo {
  url: string
  type: string
  /** YYYY-MM-DD as EDGAR reports it. */
  date: string
  periodEnd: string | null
}

interface InstitutionWithCik {
  id: string
  name: string
  ticker: string | null
  cik: string | null
}

type FilingResult =
  | {
      institution: string
      status:
        | 'no_new_filing'
        | 'already_analyzed'
        | 'could_not_fetch'
        | 'foreign_private_issuer'
    }
  | {
      institution: string
      status: 'analyzed'
      filing_type: string
      filing_date: string
      signals: number
      analysis: FilingAnalysis
    }
  | { institution: string; status: 'failed' | 'aborted'; error: string }

Deno.serve(async (req) => {
  const denied = requireServiceRole(req)
  if (denied) return denied

  try {
    // Readable 500 when ANTHROPIC_API_KEY is unset, before any EDGAR call.
    getClient()

    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, ticker, cik')
      .eq('is_active', true)
      .not('cik', 'is', null)
      .order('name', { ascending: true })
      .limit(1000)
    if (error) throw error

    const institutions = (data ?? []) as InstitutionWithCik[]
    const results: FilingResult[] = []
    let abort: { status: number; error: string } | null = null

    for (const inst of institutions) {
      if (!inst.cik) continue
      await sleep(500)

      try {
        const result = await processInstitution(inst)
        results.push(result)
      } catch (e) {
        const message = describeError(e)
        if (isRequestIndependentError(e) || isTransientDbError(e)) {
          console.error(
            `[fetch-sec-filings] aborting run at ${inst.name}: ${message}`,
          )
          abort = { status: abortStatus(e), error: message }
          results.push({
            institution: inst.name,
            status: 'aborted',
            error: message,
          })
          break
        }
        console.error(`[fetch-sec-filings] ${inst.name} failed: ${message}`)
        results.push({
          institution: inst.name,
          status: 'failed',
          error: message,
        })
      }
    }

    const summary = {
      institutions: institutions.length,
      analyzed: results.filter((r) => r.status === 'analyzed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      aborted: abort !== null,
      model: MODEL,
    }
    console.log(`[fetch-sec-filings] ${JSON.stringify(summary)}`)

    if (abort) {
      return json(
        { success: false, ...summary, error: abort.error, results },
        abort.status,
      )
    }
    return json({ success: true, ...summary, results })
  } catch (error) {
    const message = describeError(error)
    console.error(`[fetch-sec-filings] run failed: ${message}`)
    return json({ error: message }, 500)
  }
})

async function processInstitution(
  inst: InstitutionWithCik,
): Promise<FilingResult> {
  const found = await fetchLatestFiling(inst.cik!)
  if (found === null) return { institution: inst.name, status: 'no_new_filing' }
  if (found === 'foreign_private_issuer') {
    console.log(
      `[fetch-sec-filings] ${inst.name}: skipping foreign private issuer (files 20-F/40-F, not 10-K/10-Q)`,
    )
    return { institution: inst.name, status: 'foreign_private_issuer' }
  }
  const filing = found

  const { data: existing, error: existingError } = await supabase
    .from('sec_filings')
    .select('id')
    .eq('filing_url', filing.url)
    .limit(1)
  if (existingError) throw existingError
  if (existing && existing.length > 0) {
    return { institution: inst.name, status: 'already_analyzed' }
  }

  await sleep(300)
  const filingText = await fetchFilingText(filing.url)
  if (!filingText) return { institution: inst.name, status: 'could_not_fetch' }

  const excerpts = extractRelevantSections(filingText)
  const analysis = await analyzeJson(
    FilingSchema,
    ANALYSIS_PROMPT,
    `Filing: ${filing.type} for ${inst.name} (${inst.ticker ?? 'no ticker'}), filed ${filing.date}${filing.periodEnd ? `, period ending ${filing.periodEnd}` : ''}.\n\nExcerpts:\n\n${excerpts}`,
  )

  const { error: insertError } = await supabase.from('sec_filings').insert({
    institution_id: inst.id,
    filing_type: filing.type,
    filing_url: filing.url,
    filing_date: filing.date,
    period_end: filing.periodEnd,
    total_equity: analysis.total_equity,
    unrealized_losses_afs: analysis.unrealized_losses_afs,
    unrealized_losses_htm: analysis.unrealized_losses_htm,
    uninsured_deposits_pct: analysis.uninsured_deposits_pct,
    total_deposits: analysis.total_deposits,
    raw_analysis: analysis,
    analyzed_at: new Date().toISOString(),
  })
  if (insertError) throw insertError

  const signals = await generateFilingSignals(inst, filing, analysis)

  return {
    institution: inst.name,
    status: 'analyzed',
    filing_type: filing.type,
    filing_date: filing.date,
    signals,
    analysis,
  }
}

const DOMESTIC_FORMS = new Set(['10-Q', '10-K'])
const FOREIGN_FORMS = new Set(['20-F', '40-F'])

/**
 * The most recent 10-Q/10-K from the EDGAR submissions feed, or
 * 'foreign_private_issuer' when the filer only has 20-F/40-F annual reports,
 * or null when there is nothing usable.
 */
async function fetchLatestFiling(
  cik: string,
): Promise<FilingInfo | 'foreign_private_issuer' | null> {
  const paddedCik = cik.padStart(10, '0')
  const response = await fetchWithRetry(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
    { headers: SEC_HEADERS },
    { label: `data.sec.gov/submissions/CIK${paddedCik}.json` },
  )
  if (!response.ok) return null

  const data = await response.json()
  const recent = data.filings?.recent
  if (!recent) return null

  const forms: string[] = recent.form ?? []
  let foreign = false
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i]
    if (FOREIGN_FORMS.has(form)) {
      foreign = true
      continue
    }
    if (!DOMESTIC_FORMS.has(form)) continue

    const accession = String(recent.accessionNumber[i]).replace(/-/g, '')
    const primaryDoc = recent.primaryDocument[i]
    return {
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${primaryDoc}`,
      type: form,
      date: recent.filingDate[i],
      periodEnd: recent.reportDate?.[i] || null,
    }
  }
  return foreign ? 'foreign_private_issuer' : null
}

async function fetchFilingText(url: string): Promise<string | null> {
  const response = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': SEC_USER_AGENT } },
    { label: 'www.sec.gov/Archives' },
  )
  if (!response.ok) return null

  const html = await response.text()
  return (
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Curly apostrophes, encoded or literal, so "stockholders' equity" matches.
      .replace(/&#8217;|&rsquo;|&#x2019;|’/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Keywords in order of value to the prompt. Each gets its own window budget
 * so the first one can no longer consume the whole sample (F053): the old
 * shared cap of 20 chunks was filled by 'available-for-sale' before
 * 'deposits' or 'uninsured' were ever sampled.
 */
const SECTION_KEYWORDS = [
  'estimated uninsured',
  'uninsured',
  'total deposits',
  "stockholders' equity",
  "shareholders' equity",
  'available-for-sale',
  'held-to-maturity',
  'unrealized loss',
  'investment securities',
  'deposits',
  'liquidity',
  'capital ratio',
  'concentration',
]
const WINDOWS_PER_KEYWORD = 2
const WINDOW_BEFORE = 300
const WINDOW_AFTER = 1200
/** 13 keywords x 2 windows x 1500 chars = 39,000, under this cap. */
const MAX_EXCERPT_CHARS = 50_000

/**
 * Up to two 1,500-character windows per keyword, skipping occurrences that
 * an earlier keyword's window already covers, then merged in document order.
 */
function extractRelevantSections(text: string): string {
  const lower = text.toLowerCase()
  const ranges: Array<[number, number]> = []

  for (const keyword of SECTION_KEYWORDS) {
    let taken = 0
    let idx = lower.indexOf(keyword)
    while (idx !== -1 && taken < WINDOWS_PER_KEYWORD) {
      const covered = ranges.some(([start, end]) => idx >= start && idx < end)
      if (covered) {
        idx = lower.indexOf(keyword, idx + keyword.length)
        continue
      }
      const start = Math.max(0, idx - WINDOW_BEFORE)
      const end = Math.min(text.length, idx + WINDOW_AFTER)
      ranges.push([start, end])
      taken++
      idx = lower.indexOf(keyword, end)
    }
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }

  const combined = merged
    .map(([start, end]) => text.slice(start, end))
    .join('\n\n---\n\n')
  return combined.slice(0, MAX_EXCERPT_CHARS)
}

interface DerivedSignal {
  category: 'liquidity_warning' | 'client_withdrawal'
  severity: 'medium' | 'high' | 'critical'
  title: string
  description: string
  signal_value: number
}

/** Writes the threshold-derived signals for one filing; returns how many. */
async function generateFilingSignals(
  inst: InstitutionWithCik,
  filing: FilingInfo,
  analysis: FilingAnalysis,
): Promise<number> {
  const signals: DerivedSignal[] = []
  const name = inst.name

  // Unrealized losses vs equity ratio (SVB's key indicator)
  if (
    analysis.total_equity &&
    analysis.total_equity > 0 &&
    (analysis.unrealized_losses_afs || analysis.unrealized_losses_htm)
  ) {
    const totalLosses =
      (analysis.unrealized_losses_afs ?? 0) +
      (analysis.unrealized_losses_htm ?? 0)
    const ratio = (totalLosses / analysis.total_equity) * 100
    const equity = analysis.total_equity.toFixed(0)

    if (ratio > 90) {
      signals.push({
        category: 'liquidity_warning',
        severity: 'critical',
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity — SVB-pattern match`,
        description: `${name}: $${totalLosses.toFixed(0)}M unrealized losses vs $${equity}M equity. SVB was at ~94% before collapse.`,
        signal_value: ratio,
      })
    } else if (ratio > 60) {
      signals.push({
        category: 'liquidity_warning',
        severity: 'high',
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity`,
        description: `${name}: $${totalLosses.toFixed(0)}M unrealized losses vs $${equity}M equity.`,
        signal_value: ratio,
      })
    } else if (ratio > 30) {
      signals.push({
        category: 'liquidity_warning',
        severity: 'medium',
        title: `Unrealized losses at ${ratio.toFixed(0)}% of equity`,
        description: `${name}: $${totalLosses.toFixed(0)}M unrealized losses vs $${equity}M equity.`,
        signal_value: ratio,
      })
    }
  }

  // Uninsured deposit concentration (SVB was 94%)
  const uninsured = analysis.uninsured_deposits_pct
  if (uninsured !== null && uninsured > 80) {
    signals.push({
      category: 'client_withdrawal',
      severity: uninsured > 90 ? 'critical' : 'high',
      title: `${uninsured.toFixed(0)}% uninsured deposits — ${uninsured > 90 ? 'extreme' : 'high'} run vulnerability`,
      description:
        uninsured > 90
          ? `${name} has ${uninsured.toFixed(0)}% uninsured deposits. SVB had 94% uninsured at collapse.`
          : `${name} has ${uninsured.toFixed(0)}% of deposits exceeding FDIC insurance limits.`,
      signal_value: uninsured,
    })
  }

  // Deposit decline
  const change = analysis.deposit_change_pct
  if (change !== null && change < -5) {
    signals.push({
      category: 'client_withdrawal',
      severity: change < -15 ? 'high' : 'medium',
      title: `Deposits declined ${Math.abs(change).toFixed(1)}% quarter-over-quarter`,
      description: `${name} total deposits: $${analysis.total_deposits?.toFixed(0) ?? '?'}M. QoQ change: ${change.toFixed(1)}%.`,
      signal_value: change,
    })
  }

  if (signals.length === 0) return 0

  const { error } = await supabase.from('risk_signals').insert(
    signals.map((signal) => ({
      institution_id: inst.id,
      category: signal.category,
      severity: signal.severity,
      title: signal.title,
      description: signal.description,
      signal_value: signal.signal_value,
      // Dated on the filing, not on the run: the weekly cron would otherwise
      // place a quarter-old balance sheet on today's date.
      signal_date: `${filing.date}T00:00:00Z`,
      source: `SEC EDGAR ${filing.type} + Claude analysis`,
    })),
  )
  if (error) throw error
  return signals.length
}

/**
 * A Postgres/PostgREST error about the connection rather than this row: a
 * failed fetch (empty code) or SQLSTATE classes 08, 40, 53, 57, 58, XX.
 * PGRST* codes and data/integrity errors are deterministic for the row.
 */
function isTransientDbError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  if (error instanceof Error) return false
  const code = String((error as { code?: unknown }).code ?? '')
  if (code.startsWith('PGRST')) return false
  if (!/^[0-9A-Z]{5}$/.test(code)) return true
  return ['08', '40', '53', '57', '58', 'XX'].some((prefix) =>
    code.startsWith(prefix),
  )
}
