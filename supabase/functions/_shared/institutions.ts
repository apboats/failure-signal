/**
 * Institution lookup for the ingest functions (F013).
 *
 * The old lookup interpolated the model's institution name into a PostgREST
 * logic tree: `.or(\`name.ilike.%${name}%,ticker.eq.${ticker}\`)`. PostgREST
 * splits `or=` on commas, so every legal name with a comma ('Banco Santander,
 * S.A.', 'United Community Banks, Inc.') produced HTTP 400, read as "not
 * found", and inserted a duplicate row; and `name.ilike.%<long legal name>%`
 * could never match the shorter seeded name. This module loads the whole
 * table once per run (196 rows today, far under the 1000-row PostgREST cap)
 * and matches in memory:
 *
 *   1. ticker, case-insensitive ('VanEck' is a live ticker); among several
 *      rows prefer is_active, then the oldest created_at, so the seeded row
 *      wins over a later auto-discovered copy and the inactive alias
 *      ('Barclays US', BCS) never shadows the active one
 *   2. normalised name: lower-case, punctuation collapsed, a leading 'the' and
 *      trailing legal suffixes (inc, corp, plc, group, sa, ...) removed. An
 *      exact match first; otherwise whole-token containment in either
 *      direction ('capital one' ~ 'capital one financial'), never for a name
 *      shorter than four characters or made only of generic words ('bank',
 *      'first national'), with the closest token count winning
 *      ('citizens' -> 'Citizens Financial Group' over 'First Citizens
 *      BancShares')
 *
 * `findOrCreateInstitution` never creates a row for sector 'insurance' (the
 * prompt excludes insurers) and, when the insert collides with the partial
 * unique indexes from migration 00004 (SQLSTATE 23505), reloads the table and
 * matches again instead of returning null.
 *
 * The matcher is pure and dependency-free so vitest runs it under Node. The
 * two database helpers take a structurally typed client; the supabase-js
 * SupabaseClient satisfies `InstitutionsClient` as-is.
 */

export interface InstitutionRow {
  id: string
  name: string
  ticker: string | null
  is_active: boolean | null
  created_at: string | null
}

export interface NewInstitution {
  name: string
  ticker: string | null
  sector: string
  is_active: true
}

export interface DbError {
  code?: string
  message: string
}

/** The slice of supabase-js this module uses, so tests can pass a fake. */
export interface InstitutionsClient {
  from(table: 'institutions'): {
    select(columns: string): {
      order(
        column: string,
        options: { ascending: boolean },
      ): {
        limit(
          count: number,
        ): PromiseLike<{ data: InstitutionRow[] | null; error: DbError | null }>
      }
    }
    insert(values: NewInstitution): {
      select(columns: string): {
        single(): PromiseLike<{
          data: InstitutionRow | null
          error: DbError | null
        }>
      }
    }
  }
}

interface NameEntry {
  row: InstitutionRow
  /** Normalised tokens, legal suffixes removed. */
  tokens: string[]
  /** Tokens joined without spaces: the same key as the 00004 unique index. */
  key: string
}

export interface InstitutionIndex {
  rows: InstitutionRow[]
  byId: Map<string, InstitutionRow>
  /** Upper-cased ticker -> rows, best candidate first. */
  byTicker: Map<string, InstitutionRow[]>
  names: NameEntry[]
}

export interface MatchQuery {
  name?: string | null
  ticker?: string | null
}

/** Rows loaded per run; the PostgREST max_rows cap on the live project. */
export const INSTITUTION_LOAD_LIMIT = 1000

/** Containment matches need at least this many characters on the short side. */
const MIN_CONTAINMENT_LENGTH = 4

/**
 * Words that appear in dozens of bank names. A containment query made only
 * of these ('Bank', 'First National', 'Community Bancorp') would match almost
 * anything, so it needs at least one token outside this set. Exact matches
 * are unaffected.
 */
const GENERIC_TOKENS = new Set([
  'bank',
  'banks',
  'banking',
  'bancorp',
  'bancorporation',
  'bancshares',
  'bankshares',
  'financial',
  'finance',
  'trust',
  'capital',
  'first',
  'national',
  'savings',
  'community',
  'federal',
  'credit',
  'union',
  'services',
  'partners',
  'global',
  'international',
  'investment',
  'investments',
  'securities',
  'markets',
  'the',
  'of',
  'and',
  'us',
])

/**
 * Trailing tokens that carry no identity: corporate forms, 'group',
 * 'holdings'. 'bank', 'financial' and 'bancorp' stay, they distinguish names.
 */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'limited',
  'plc',
  'llc',
  'lp',
  'sa',
  'nv',
  'ag',
  'se',
  'na',
  'group',
  'holdings',
  'holding',
])

/**
 * Lower-cases, collapses punctuation to spaces, drops a leading 'the' and
 * trailing legal suffixes. A name made only of suffixes keeps its raw tokens.
 */
export function nameTokens(name: string): string[] {
  const raw = name
    .toLowerCase()
    // Periods and apostrophes mark abbreviations and possessives, not word
    // breaks: 'S.A.' -> 'sa', 'U.S.' -> 'us', "People's" -> 'peoples'.
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0)
  if (raw.length === 0) return []
  const tokens = [...raw]
  if (tokens.length > 1 && tokens[0] === 'the') tokens.shift()
  while (tokens.length > 0 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  return tokens.length > 0 ? tokens : raw
}

/** The normalised name as one string, e.g. 'Banco Santander, S.A.' -> 'banco santander'. */
export function normalizeInstitutionName(name: string): string {
  return nameTokens(name).join(' ')
}

/** 'nyse:jpm', '$JPM', ' jpm ' -> 'JPM'; empty or null -> null. */
export function normalizeTicker(
  ticker: string | null | undefined,
): string | null {
  if (!ticker) return null
  const cleaned = ticker
    .trim()
    .replace(/^[a-z]+:/i, '')
    .replace(/^\$/, '')
    .trim()
    .toUpperCase()
  return cleaned.length > 0 ? cleaned : null
}

/** Active rows first, then the oldest created_at, then id for determinism. */
export function compareInstitutionPreference(
  a: InstitutionRow,
  b: InstitutionRow,
): number {
  const activeA = a.is_active ? 0 : 1
  const activeB = b.is_active ? 0 : 1
  if (activeA !== activeB) return activeA - activeB
  const createdA = a.created_at ?? '9999'
  const createdB = b.created_at ?? '9999'
  if (createdA !== createdB) return createdA < createdB ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function buildInstitutionIndex(
  rows: InstitutionRow[],
): InstitutionIndex {
  const index: InstitutionIndex = {
    rows: [],
    byId: new Map(),
    byTicker: new Map(),
    names: [],
  }
  for (const row of rows) addInstitution(index, row)
  return index
}

/** Adds one row (e.g. just inserted) so later lookups in the same run see it. */
export function addInstitution(
  index: InstitutionIndex,
  row: InstitutionRow,
): void {
  if (index.byId.has(row.id)) return
  index.rows.push(row)
  index.byId.set(row.id, row)

  const ticker = normalizeTicker(row.ticker)
  if (ticker) {
    const list = index.byTicker.get(ticker) ?? []
    list.push(row)
    list.sort(compareInstitutionPreference)
    index.byTicker.set(ticker, list)
  }

  const tokens = nameTokens(row.name)
  if (tokens.length > 0) {
    index.names.push({ row, tokens, key: tokens.join('') })
  }
}

/** Whether `short` appears as a contiguous run inside `long`. */
function containsTokens(long: string[], short: string[]): boolean {
  if (short.length === 0 || short.length > long.length) return false
  if (short.every((t) => GENERIC_TOKENS.has(t))) return false
  outer: for (let i = 0; i + short.length <= long.length; i++) {
    for (let j = 0; j < short.length; j++) {
      if (long[i + j] !== short[j]) continue outer
    }
    return true
  }
  return false
}

interface NameCandidate {
  row: InstitutionRow
  exact: boolean
  tokenDiff: number
}

function compareCandidates(a: NameCandidate, b: NameCandidate): number {
  if (a.exact !== b.exact) return a.exact ? -1 : 1
  if (a.tokenDiff !== b.tokenDiff) return a.tokenDiff - b.tokenDiff
  return compareInstitutionPreference(a.row, b.row)
}

/**
 * Finds the institution a (name, ticker) pair refers to, or null. Ticker
 * wins when it matches anything; the name is only consulted otherwise.
 */
export function matchInstitution(
  index: InstitutionIndex,
  query: MatchQuery,
): InstitutionRow | null {
  const ticker = normalizeTicker(query.ticker)
  if (ticker) {
    const rows = index.byTicker.get(ticker)
    if (rows && rows.length > 0) return rows[0]
  }

  const tokens = query.name ? nameTokens(query.name) : []
  if (tokens.length === 0) return null
  const key = tokens.join('')

  const candidates: NameCandidate[] = []
  for (const entry of index.names) {
    if (entry.key === key) {
      candidates.push({ row: entry.row, exact: true, tokenDiff: 0 })
      continue
    }
    const shorter = Math.min(key.length, entry.key.length)
    if (shorter < MIN_CONTAINMENT_LENGTH) continue
    if (
      containsTokens(entry.tokens, tokens) ||
      containsTokens(tokens, entry.tokens)
    ) {
      candidates.push({
        row: entry.row,
        exact: false,
        tokenDiff: Math.abs(entry.tokens.length - tokens.length),
      })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort(compareCandidates)
  return candidates[0].row
}

const SELECT_COLUMNS = 'id, name, ticker, is_active, created_at'

/** Loads every institution (active or not) into an index. Throws on a read error. */
export async function loadInstitutionIndex(
  db: InstitutionsClient,
): Promise<InstitutionIndex> {
  const { data, error } = await db
    .from('institutions')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(INSTITUTION_LOAD_LIMIT)
  if (error) throw new Error(`institutions load failed: ${error.message}`)
  const rows = data ?? []
  if (rows.length >= INSTITUTION_LOAD_LIMIT) {
    console.warn(
      `[institutions] loaded ${rows.length} rows, the PostgREST cap; rows beyond it are invisible to the matcher`,
    )
  }
  return buildInstitutionIndex(rows)
}

export interface DiscoveredInstitution {
  name: string
  ticker?: string | null
  sector?: string | null
}

/**
 * Returns the id of the matching institution, creating an active row when
 * nothing matches. Returns null for an empty name, for sector 'insurance'
 * (not tracked), and when the insert fails for a reason other than a unique
 * violation. The index is updated in place so the rest of the batch sees the
 * new row.
 */
export async function findOrCreateInstitution(
  db: InstitutionsClient,
  index: InstitutionIndex,
  discovered: DiscoveredInstitution,
): Promise<string | null> {
  const name = discovered.name.trim()
  if (name.length === 0) return null
  if (discovered.sector === 'insurance') {
    console.log(`[institutions] not creating insurer ${name}`)
    return null
  }

  const matched = matchInstitution(index, {
    name,
    ticker: discovered.ticker,
  })
  if (matched) return matched.id

  const values: NewInstitution = {
    name,
    ticker: normalizeTicker(discovered.ticker),
    sector: discovered.sector || 'banking',
    is_active: true,
  }
  const { data, error } = await db
    .from('institutions')
    .insert(values)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      // A concurrent run or a punctuation-only variant already holds this
      // name/ticker: reload and match again rather than giving up.
      try {
        const fresh = await loadInstitutionIndex(db)
        index.rows.length = 0
        index.byId.clear()
        index.byTicker.clear()
        index.names.length = 0
        for (const row of fresh.rows) addInstitution(index, row)
      } catch (reloadError) {
        console.error(
          `[institutions] reload after unique violation failed: ${String(reloadError)}`,
        )
        return null
      }
      const again = matchInstitution(index, { name, ticker: discovered.ticker })
      if (!again) {
        console.error(
          `[institutions] unique violation for ${name} (${values.ticker ?? 'no ticker'}) but no row matches after reload`,
        )
      }
      return again?.id ?? null
    }
    console.error(`[institutions] create failed for ${name}: ${error.message}`)
    return null
  }
  if (!data) {
    console.error(`[institutions] create returned no row for ${name}`)
    return null
  }

  addInstitution(index, data)
  console.log(
    `[institutions] auto-discovered ${data.name} (${data.ticker ?? 'no ticker'}, ${values.sector})`,
  )
  return data.id
}
