/**
 * How likely is a discovered company to be a US bank?
 *
 * classify-pending looks the company up in the SEC's ticker list and its
 * EDGAR submissions record, then asks this module for a 0..1 estimate and the
 * reasons behind it. Pure and dependency-free so vitest covers it under Node.
 *
 * It is a transparent additive heuristic, not a fitted model. The strongest
 * evidence is the SEC Standard Industrial Classification code: commercial
 * banks, savings institutions and bank holding companies file under a small
 * set of codes, while lenders like Upstart, payment companies like Block,
 * brokers and insurers file under others. Listing exchange and headquarters
 * country refine it, and the news model's own sector guess counts a little.
 */

/** SIC codes EDGAR uses for depository institutions and their holding companies. */
export const BANK_SIC: Readonly<Record<string, string>> = {
  '6021': 'National commercial bank',
  '6022': 'State commercial bank',
  '6029': 'Commercial bank, not elsewhere classified',
  '6035': 'Savings institution, federally chartered',
  '6036': 'Savings institution, not federally chartered',
  '6712': 'Bank holding company',
}

/** Bank-adjacent: depository-banking services and trust companies. */
const BANK_ADJACENT_SIC = new Set(['6099', '6091'])
/** Non-bank credit: consumer and business lenders, card and loan marketplaces. */
const NON_BANK_CREDIT_SIC = new Set([
  '6111',
  '6141',
  '6153',
  '6159',
  '6162',
  '6163',
  '6172',
  '6199',
])
/** Brokers, dealers, exchanges and asset managers. */
const SECURITIES_SIC = new Set(['6200', '6211', '6221', '6282'])

export interface SecRecord {
  cik: string
  /** Four-digit SIC code as EDGAR reports it, or null when absent. */
  sic: string | null
  sicDescription: string | null
  /** e.g. ['NYSE'], ['Nasdaq'], ['OTC'], or [] */
  exchanges: string[]
  /** Business-address state or country code (two letters for US states). */
  stateOrCountry: string | null
}

export interface ClassifierInput {
  name: string
  ticker: string | null
  /** The news model's sector guess at discovery time. */
  sector: string | null
  /** null when the company was not found in the SEC ticker list. */
  sec: SecRecord | null
  /** How the SEC record was found, for the evidence trail. */
  matchedBy: 'ticker' | 'name' | null
}

export interface Classification {
  /** 0.01..0.99, three decimals. */
  probability: number
  reasons: string[]
}

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(
    ' ',
  ),
)
const MAJOR_EXCHANGES = new Set([
  'NYSE',
  'NASDAQ',
  'NYSE AMERICAN',
  'NYSE ARCA',
  'CBOE',
])

export function classifyInstitution(input: ClassifierInput): Classification {
  const reasons: string[] = []
  let p = 0.1

  const { sec } = input
  if (sec === null) {
    reasons.push(
      input.ticker
        ? `Ticker ${input.ticker} is not in the SEC company list: likely foreign-listed or not public in the US`
        : 'No ticker and no SEC company with this name: likely private or foreign',
    )
    p -= 0.05
  } else {
    p += 0.15
    reasons.push(
      `SEC registrant (CIK ${sec.cik}), found by ${input.matchedBy ?? 'ticker'}`,
    )

    const sic = sec.sic ?? ''
    const label = sec.sicDescription ?? BANK_SIC[sic] ?? 'unknown industry'
    if (sic in BANK_SIC) {
      p += 0.55
      reasons.push(`Industry code ${sic} (${label}) is a bank code`)
    } else if (BANK_ADJACENT_SIC.has(sic)) {
      p += 0.2
      reasons.push(`Industry code ${sic} (${label}) is bank-adjacent`)
    } else if (NON_BANK_CREDIT_SIC.has(sic)) {
      p -= 0.1
      reasons.push(
        `Industry code ${sic} (${label}): a lender or credit company, not a bank`,
      )
    } else if (SECURITIES_SIC.has(sic)) {
      p -= 0.1
      reasons.push(
        `Industry code ${sic} (${label}): securities or asset management, not a bank`,
      )
    } else if (sic.startsWith('63') || sic.startsWith('64')) {
      p -= 0.15
      reasons.push(`Industry code ${sic} (${label}): insurance, not a bank`)
    } else if (sic) {
      p -= 0.1
      reasons.push(
        `Industry code ${sic} (${label}) is outside financial services`,
      )
    } else {
      reasons.push('SEC record has no industry code')
    }

    const exchanges = sec.exchanges.map((e) => e.toUpperCase())
    if (exchanges.some((e) => MAJOR_EXCHANGES.has(e))) {
      p += 0.1
      reasons.push(`Listed on ${sec.exchanges.join(', ')}`)
    } else if (exchanges.includes('OTC')) {
      p -= 0.05
      reasons.push('Trades over the counter only')
    }

    const where = (sec.stateOrCountry ?? '').toUpperCase()
    if (US_STATES.has(where)) {
      p += 0.05
      reasons.push(`Headquartered in the US (${where})`)
    } else if (where) {
      p -= 0.1
      reasons.push(`Headquartered outside the US (${where})`)
    }
  }

  if (input.sector === 'banking') {
    p += 0.05
    reasons.push('The news model described it as a bank')
  } else if (input.sector) {
    p -= 0.05
    reasons.push(
      `The news model described it as ${input.sector.replace('_', ' ')}`,
    )
  }

  const probability =
    Math.round(Math.min(0.99, Math.max(0.01, p)) * 1000) / 1000
  return { probability, reasons }
}

/** Lower-case, legal suffixes and punctuation removed, for matching SEC titles to discovered names. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(
      /\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings?|group|the|n\.?a|s\.?a)\b\.?/g,
      ' ',
    )
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
