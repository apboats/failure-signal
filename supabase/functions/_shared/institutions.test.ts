import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addInstitution,
  buildInstitutionIndex,
  findOrCreateInstitution,
  INSTITUTION_LOAD_LIMIT,
  loadInstitutionIndex,
  matchInstitution,
  nameTokens,
  normalizeInstitutionName,
  normalizeTicker,
  type DbError,
  type InstitutionRow,
  type InstitutionsClient,
  type NewInstitution,
} from './institutions.ts'

function row(
  id: string,
  name: string,
  ticker: string | null,
  overrides: Partial<InstitutionRow> = {},
): InstitutionRow {
  return {
    id,
    name,
    ticker,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** The live shapes the matcher has to cope with (see the module header). */
const SEEDED: InstitutionRow[] = [
  row('san-seed', 'Banco Santander', 'SAN', {
    is_active: false,
    created_at: '2026-03-01T00:00:00Z',
  }),
  row('san-dup-1', 'Banco Santander, S.A.', 'SAN', {
    created_at: '2026-05-01T00:00:00Z',
  }),
  row('san-dup-2', 'Banco Santander, S.A.', 'SAN', {
    created_at: '2026-06-01T00:00:00Z',
  }),
  row('ucb-1', 'United Community Banks, Inc.', 'UCB', {
    created_at: '2026-04-01T00:00:00Z',
  }),
  row('ucb-2', 'United Community Banks, Inc.', 'UCB', {
    created_at: '2026-04-02T00:00:00Z',
  }),
  row('bcs-us', 'Barclays US', 'BCS', { is_active: false }),
  row('bcs', 'Barclays', 'BCS', { created_at: '2026-02-01T00:00:00Z' }),
  row('gs', 'Goldman Sachs', 'GS'),
  row('jpm', 'JPMorgan Chase', 'JPM'),
  row('cfg', 'Citizens Financial Group', 'CFG'),
  row('fcnca', 'First Citizens BancShares', 'FCNCA'),
  row('cof', 'Capital One Financial', 'COF'),
  row('usb', 'U.S. Bancorp', 'USB'),
  row('vaneck', 'VanEck Associates Corporation', 'VanEck'),
  row('ubs', 'UBS Group', 'UBS'),
  row('c', 'Citigroup', 'C'),
  row('coin-old', 'Coinbase Global, Inc.', 'COIN', {
    is_active: false,
    created_at: '2025-12-01T00:00:00Z',
  }),
  row('coin', 'Coinbase Global', 'COIN', {
    created_at: '2026-01-15T00:00:00Z',
  }),
  row('frc', 'First Republic Bank', 'FRC', { is_active: false }),
  row('cf', 'C&F Financial Corporation', 'CFFI'),
  row('mt', 'M&T Bank', 'MTB'),
]

/** In-memory stand-in for the supabase-js client slice the module uses. */
class FakeDb implements InstitutionsClient {
  rows: InstitutionRow[]
  inserts: NewInstitution[] = []
  selectCalls = 0
  selectError: DbError | null = null
  /** Errors returned by successive inserts; the queue drains one per call. */
  insertErrors: DbError[] = []
  /** When an insert succeeds, this row is also appended to `rows`. */
  nextId = 1

  constructor(rows: InstitutionRow[]) {
    this.rows = rows.map((r) => ({ ...r }))
  }

  from() {
    return {
      select: () => ({
        order: (_column: string, options: { ascending: boolean }) => ({
          limit: (count: number) => {
            this.selectCalls++
            const ordered = [...this.rows].sort((a, b) =>
              (a.created_at ?? '') < (b.created_at ?? '')
                ? options.ascending
                  ? -1
                  : 1
                : options.ascending
                  ? 1
                  : -1,
            )
            return Promise.resolve({
              data: this.selectError ? null : ordered.slice(0, count),
              error: this.selectError,
            })
          },
        }),
      }),
      insert: (values: NewInstitution) => ({
        select: () => ({
          single: () => {
            this.inserts.push(values)
            const error = this.insertErrors.shift()
            if (error) return Promise.resolve({ data: null, error })
            const created: InstitutionRow = {
              id: `new-${this.nextId++}`,
              name: values.name,
              ticker: values.ticker,
              is_active: values.is_active,
              created_at: '2026-11-18T00:00:00Z',
            }
            this.rows.push(created)
            return Promise.resolve({ data: created, error: null })
          },
        }),
      }),
    }
  }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('nameTokens / normalizeInstitutionName', () => {
  it('strips commas and legal suffixes from comma names', () => {
    expect(normalizeInstitutionName('Banco Santander, S.A.')).toBe(
      'banco santander',
    )
    expect(normalizeInstitutionName('United Community Banks, Inc.')).toBe(
      'united community banks',
    )
    expect(normalizeInstitutionName('The Goldman Sachs Group, Inc.')).toBe(
      'goldman sachs',
    )
  })

  it('strips stacked suffixes but keeps distinguishing words', () => {
    expect(normalizeInstitutionName('Permanent TSB Group Holdings plc')).toBe(
      'permanent tsb',
    )
    expect(normalizeInstitutionName('Zions Bancorporation, N.A.')).toBe(
      'zions bancorporation',
    )
    expect(normalizeInstitutionName('Wells Fargo & Company')).toBe(
      'wells fargo',
    )
    expect(normalizeInstitutionName('Deutsche Bank AG')).toBe('deutsche bank')
    expect(normalizeInstitutionName('Ally Financial Inc.')).toBe(
      'ally financial',
    )
    expect(normalizeInstitutionName('Ageas SA/NV')).toBe('ageas')
  })

  it('never strips a name down to nothing', () => {
    expect(nameTokens('Group Inc')).toEqual(['group', 'inc'])
    expect(nameTokens('Company')).toEqual(['company'])
    expect(nameTokens('   ')).toEqual([])
    expect(nameTokens('The')).toEqual(['the'])
  })

  it('treats punctuation-only differences as equal', () => {
    expect(nameTokens('U.S. Bancorp').join('')).toBe(
      nameTokens('US Bancorp').join(''),
    )
    expect(normalizeInstitutionName('C&F Financial Corporation')).toBe(
      'c f financial',
    )
  })
})

describe('normalizeTicker', () => {
  it('upper-cases and strips exchange prefixes and dollar signs', () => {
    expect(normalizeTicker('jpm')).toBe('JPM')
    expect(normalizeTicker(' NYSE:bac ')).toBe('BAC')
    expect(normalizeTicker('$GS')).toBe('GS')
    expect(normalizeTicker('VanEck')).toBe('VANECK')
  })

  it('returns null for empty input', () => {
    expect(normalizeTicker(null)).toBeNull()
    expect(normalizeTicker(undefined)).toBeNull()
    expect(normalizeTicker('  ')).toBeNull()
    expect(normalizeTicker('$')).toBeNull()
  })
})

describe('matchInstitution', () => {
  const index = buildInstitutionIndex(SEEDED)

  it('matches tickers case-insensitively', () => {
    expect(matchInstitution(index, { ticker: 'jpm' })?.id).toBe('jpm')
    expect(matchInstitution(index, { ticker: 'vaneck' })?.id).toBe('vaneck')
    expect(matchInstitution(index, { ticker: 'VANECK' })?.id).toBe('vaneck')
    expect(
      matchInstitution(index, { name: 'Anything', ticker: 'GS' })?.id,
    ).toBe('gs')
  })

  it('prefers the active row when a ticker is shared with an inactive alias', () => {
    expect(matchInstitution(index, { ticker: 'BCS' })?.id).toBe('bcs')
    expect(matchInstitution(index, { ticker: 'COIN' })?.id).toBe('coin')
  })

  it('prefers the oldest active row among duplicates', () => {
    expect(matchInstitution(index, { ticker: 'SAN' })?.id).toBe('san-dup-1')
    expect(matchInstitution(index, { ticker: 'UCB' })?.id).toBe('ucb-1')
  })

  it('falls back to the inactive row when only it carries the ticker', () => {
    expect(matchInstitution(index, { ticker: 'FRC' })?.id).toBe('frc')
  })

  it('matches comma names by normalised name', () => {
    expect(
      matchInstitution(index, { name: 'United Community Banks, Inc.' })?.id,
    ).toBe('ucb-1')
    expect(matchInstitution(index, { name: 'Banco Santander, S.A.' })?.id).toBe(
      'san-dup-1',
    )
    expect(matchInstitution(index, { name: 'Banco Santander SA' })?.id).toBe(
      'san-dup-1',
    )
  })

  it('matches across legal-suffix and punctuation variants', () => {
    expect(
      matchInstitution(index, { name: 'The Goldman Sachs Group, Inc.' })?.id,
    ).toBe('gs')
    expect(matchInstitution(index, { name: 'JPMorgan Chase & Co.' })?.id).toBe(
      'jpm',
    )
    expect(matchInstitution(index, { name: 'US Bancorp' })?.id).toBe('usb')
    expect(matchInstitution(index, { name: 'UBS Group AG' })?.id).toBe('ubs')
    expect(matchInstitution(index, { name: 'C&F Financial' })?.id).toBe('cf')
    expect(matchInstitution(index, { name: 'M&T Bank Corporation' })?.id).toBe(
      'mt',
    )
  })

  it('matches by whole-token containment in either direction', () => {
    expect(matchInstitution(index, { name: 'Capital One' })?.id).toBe('cof')
    expect(matchInstitution(index, { name: 'Goldman' })?.id).toBe('gs')
    expect(
      matchInstitution(index, { name: 'Citizens Financial Group, Inc.' })?.id,
    ).toBe('cfg')
    expect(
      matchInstitution(index, { name: 'Coinbase Global Holdings Inc' })?.id,
    ).toBe('coin')
  })

  it('picks the closest name when several contain the query', () => {
    expect(matchInstitution(index, { name: 'Citizens' })?.id).toBe('cfg')
  })

  it('does not match on substrings inside words or very short names', () => {
    expect(matchInstitution(index, { name: 'Citi' })).toBeNull()
    expect(matchInstitution(index, { name: 'UBS' })?.id).toBe('ubs')
    expect(matchInstitution(index, { name: 'One' })).toBeNull()
    expect(matchInstitution(index, { name: 'Bank' })).toBeNull()
  })

  it('uses the ticker before the name, and the name when the ticker is unknown', () => {
    expect(
      matchInstitution(index, { name: 'Barclays', ticker: 'BARC' })?.id,
    ).toBe('bcs')
    expect(
      matchInstitution(index, { name: 'Goldman Sachs', ticker: 'C' })?.id,
    ).toBe('c')
  })

  it('returns null for nothing to match on', () => {
    expect(matchInstitution(index, {})).toBeNull()
    expect(matchInstitution(index, { name: '', ticker: null })).toBeNull()
    expect(matchInstitution(index, { name: 'Nonexistent Trust' })).toBeNull()
  })

  it('sees rows added after the index was built', () => {
    const local = buildInstitutionIndex(SEEDED)
    addInstitution(local, row('new', 'Example Bancorp', 'EXB'))
    expect(matchInstitution(local, { ticker: 'exb' })?.id).toBe('new')
    expect(matchInstitution(local, { name: 'Example Bancorp Inc.' })?.id).toBe(
      'new',
    )
    expect(local.byId.get('new')?.name).toBe('Example Bancorp')
    // Adding the same row twice is a no-op.
    addInstitution(local, row('new', 'Example Bancorp', 'EXB'))
    expect(local.rows.filter((r) => r.id === 'new')).toHaveLength(1)
  })
})

describe('loadInstitutionIndex', () => {
  it('loads every row in created_at order with the 1000-row cap', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    expect(index.rows).toHaveLength(SEEDED.length)
    expect(index.byId.size).toBe(SEEDED.length)
    expect(db.selectCalls).toBe(1)
    expect(INSTITUTION_LOAD_LIMIT).toBe(1000)
  })

  it('throws on a read error', async () => {
    const db = new FakeDb(SEEDED)
    db.selectError = { code: '57P01', message: 'terminating connection' }
    await expect(loadInstitutionIndex(db)).rejects.toThrow(
      'institutions load failed: terminating connection',
    )
  })
})

describe('findOrCreateInstitution', () => {
  it('returns the existing id without inserting', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    const id = await findOrCreateInstitution(db, index, {
      name: 'Banco Santander, S.A.',
      ticker: 'san',
      sector: 'banking',
    })
    expect(id).toBe('san-dup-1')
    expect(db.inserts).toHaveLength(0)
  })

  it('returns null for insurers and never inserts', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    const id = await findOrCreateInstitution(db, index, {
      name: 'Aegon N.V.',
      ticker: 'AEG',
      sector: 'insurance',
    })
    expect(id).toBeNull()
    expect(db.inserts).toHaveLength(0)
  })

  it('returns null for an empty name', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    expect(await findOrCreateInstitution(db, index, { name: '  ' })).toBeNull()
    expect(db.inserts).toHaveLength(0)
  })

  it('creates an active row with a normalised ticker and adds it to the index', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    const id = await findOrCreateInstitution(db, index, {
      name: 'Example Bancorp',
      ticker: 'nyse:exb',
      sector: null,
    })
    expect(id).toBe('new-1')
    expect(db.inserts).toEqual([
      {
        name: 'Example Bancorp',
        ticker: 'EXB',
        sector: 'banking',
        is_active: true,
      },
    ])
    expect(matchInstitution(index, { ticker: 'EXB' })?.id).toBe('new-1')
    expect(matchInstitution(index, { name: 'Example Bancorp, Inc.' })?.id).toBe(
      'new-1',
    )
  })

  it('re-runs the lookup after a unique violation instead of returning null', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    // Another run inserted the same bank between our load and our insert.
    db.rows.push(
      row('raced', 'Example Bancorp', 'EXB', {
        created_at: '2026-11-18T00:00:00Z',
      }),
    )
    db.insertErrors.push({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "institutions_active_ticker_uq"',
    })
    const id = await findOrCreateInstitution(db, index, {
      name: 'Example Bancorp',
      ticker: 'EXB',
      sector: 'banking',
    })
    expect(id).toBe('raced')
    expect(db.inserts).toHaveLength(1)
    expect(db.selectCalls).toBe(2)
    expect(index.byId.has('raced')).toBe(true)
  })

  it('returns null when the unique violation cannot be resolved by a reload', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    db.insertErrors.push({ code: '23505', message: 'duplicate key' })
    const id = await findOrCreateInstitution(db, index, {
      name: 'Phantom Bank',
      ticker: 'PHB',
    })
    expect(id).toBeNull()
  })

  it('returns null on any other insert error', async () => {
    const db = new FakeDb(SEEDED)
    const index = await loadInstitutionIndex(db)
    db.insertErrors.push({ code: '23502', message: 'null value in column' })
    const id = await findOrCreateInstitution(db, index, {
      name: 'Example Bancorp',
      ticker: 'EXB',
    })
    expect(id).toBeNull()
    expect(db.selectCalls).toBe(1)
  })
})
