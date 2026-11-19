import type { CaseStudy, TimelineEvent } from './types'

/*
 * Every event below is carried over verbatim from the retired
 * HistoricalAnalysis page (21 events). Dates are ISO; the two month-only
 * events keep `precision: 'month'`.
 *
 * Scores are modelled, not measured: the live index did not exist in 2022.
 * They follow the 0–100 progression the retired page drew, mapped band for
 * band onto the live index (its 20/40/60/80 ladder onto the SHORT_EXIT /
 * WATCH / SHORT_ENTRY / SEVERE edges 5/8/15/25, and 100 onto 35, just past
 * the live all-time high of 33.5), then interpolated for the events between
 * that progression's anchors.
 */
const timeline: readonly TimelineEvent[] = [
  {
    date: '2022-03-16',
    title: 'Fed begins rate hike cycle (25bp)',
    description:
      'Federal Reserve raises rates for the first time since 2018. SVB holds $91B in long-duration HTM securities — the beginning of a massive unrealized loss accumulation.',
    category: 'liquidity_warning',
    severity: 'low',
    stockPrice: '~$590',
    score: 15,
  },
  {
    date: '2022-05-19',
    title: 'CEO Becker sells $3.6M in stock',
    description:
      'CEO Greg Becker sells shares via SEC Form 4 filing. Fed has raised rates 75bp total. SVB stock already down ~12% from peak.',
    category: 'executive_departure',
    severity: 'low',
    stockPrice: '~$470',
    score: 20,
  },
  {
    date: '2022-06-15',
    title: 'Fed raises 75bp — aggressive tightening',
    description:
      "Largest rate hike since 1994. SVB's bond portfolio is hemorrhaging unrealized value. Tech sector valuations compress sharply.",
    category: 'liquidity_warning',
    severity: 'medium',
    stockPrice: '~$420',
    score: 28,
  },
  {
    date: '2022-07-21',
    title: 'Q2 earnings: First deposit decline',
    description:
      'SVB reports deposits fell from $189B to $181B — the first decline. AFS unrealized losses reach ~$2.5B. Analysts begin flagging concentration risk.',
    category: 'client_withdrawal',
    severity: 'medium',
    stockPrice: '~$395',
    score: 34,
  },
  {
    date: '2022-10-20',
    title: 'Q3 earnings: Unrealized losses reach ~$17B',
    description:
      "Deposits decline further to ~$173B. Total unrealized losses across securities portfolios reach ~$15-17B — roughly equal to SVB's total shareholder equity. Seeking Alpha publishes bearish analysis.",
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$280',
    score: 42,
  },
  {
    date: '2022-11-01',
    precision: 'month',
    title: 'Short interest climbs above 5% of float',
    description:
      'Bloomberg terminal data shows short interest rising notably. Sophisticated investors betting against SVB. Stock continues declining.',
    category: 'news_sentiment',
    severity: 'medium',
    stockPrice: '~$250',
    score: 48,
  },
  {
    date: '2023-01-04',
    title: 'Silvergate discloses $8.1B deposit outflows',
    description:
      'Silvergate Capital (crypto bank) reveals massive Q4 deposit flight. Market scrutiny intensifies on all banks with concentrated, flighty deposit bases — including SVB.',
    category: 'counterparty_action',
    severity: 'medium',
    stockPrice: '~$245',
    score: 52,
  },
  {
    date: '2023-01-19',
    title: 'Q4 earnings: $15.1B HTM unrealized losses confirmed',
    description:
      'SVB confirms deposits flat at ~$173B and HTM unrealized losses of $15.1B in footnotes. Management projects further deposit declines in 2023. Market skeptical despite reassurance.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$270',
    score: 55,
  },
  {
    date: '2023-01-26',
    title: 'CEO Becker sells $3.6M more stock',
    description:
      'CEO sells additional shares under 10b5-1 plan, approximately 6 weeks before collapse. Later reported by WSJ.',
    category: 'executive_departure',
    severity: 'medium',
    stockPrice: '~$280',
    score: 58,
  },
  {
    date: '2023-02-01',
    precision: 'month',
    title: 'VCs privately advise deposit diversification',
    description:
      "Peter Thiel's Founders Fund and other VC firms quietly begin advising portfolio companies to move money out of SVB. Not yet public but deposit outflows accelerate.",
    category: 'client_withdrawal',
    severity: 'high',
    score: 62,
  },
  {
    date: '2023-03-01',
    title: 'Silvergate delays 10-K filing',
    description:
      'Silvergate announces it cannot file annual report on time, raising going-concern doubts. Peer contagion risk for SVB spikes.',
    category: 'counterparty_action',
    severity: 'high',
    stockPrice: '~$284',
    score: 68,
  },
  {
    date: '2023-03-08',
    title: 'Silvergate announces voluntary liquidation',
    description:
      'Silvergate Capital will wind down and liquidate. This is the immediate catalyst that puts SVB under maximum scrutiny from investors and depositors.',
    category: 'counterparty_action',
    severity: 'critical',
    stockPrice: '~$267',
    score: 72,
  },
  {
    date: '2023-03-08',
    title: 'SVB announces $1.8B loss + $2.25B capital raise',
    description:
      'After market close, SVB reveals it sold $21B in AFS securities at a $1.8B loss and plans to raise $2.25B in equity. The simultaneous loss realization + dilutive raise triggers panic. Stock drops ~7% after-hours.',
    category: 'liquidity_warning',
    severity: 'critical',
    stockPrice: '~$248 AH',
    score: 88,
  },
  {
    date: '2023-03-09',
    title: 'Stock crashes 60% — VCs tell companies to flee',
    description:
      'SIVB opens at ~$180, closes at $106. Founders Fund, Coatue, Union Square Ventures, Y Combinator all publicly advise portfolio companies to pull deposits. $42B in withdrawals requested in a single day.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '$106',
    score: 93,
  },
  {
    date: '2023-03-09',
    title: '$42 billion in withdrawal requests',
    description:
      'Customers attempt to withdraw $42B — roughly 25% of total deposits — in a single day. A 21st-century digital bank run amplified by Twitter and VC group chats.',
    category: 'client_withdrawal',
    severity: 'critical',
    score: 95,
  },
  {
    date: '2023-03-09',
    title: "Moody's downgrades SVB three notches",
    description:
      "Moody's cuts SVB Financial Group from A3 to Baa1 — a three-notch downgrade — and places on review for further downgrade.",
    category: 'credit_downgrade',
    severity: 'critical',
    score: 96,
  },
  {
    date: '2023-03-10',
    title: 'Trading halted pre-market',
    description:
      'SIVB stock halted after dropping to ~$35 in pre-market. CEO Becker makes a final call asking depositors to "stay calm." Bank had negative cash balance of -$958M.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '~$35 (halted)',
    score: 97,
  },
  {
    date: '2023-03-10',
    title: 'FDIC seizes SVB — 2nd largest bank failure in US history',
    description:
      'California DFPI closes Silicon Valley Bank at 11:30 AM ET. FDIC appointed as receiver. Second-largest bank failure in US history after Washington Mutual (2008).',
    category: 'regulatory_signal',
    severity: 'critical',
    score: 100,
  },
  {
    date: '2023-03-12',
    title: 'Full depositor guarantee + Signature Bank closed',
    description:
      'Treasury, Fed, and FDIC guarantee all SVB and Signature Bank depositors. Fed launches Bank Term Funding Program (BTFP). Signature Bank also closed by NY regulators.',
    category: 'regulatory_signal',
    severity: 'critical',
    score: 100,
  },
  {
    date: '2023-03-13',
    title: 'Contagion: First Republic drops 60%, regionals crater',
    description:
      'First Republic Bank stock drops ~60%. Regional bank index falls ~12%. PacWest, Western Alliance, Zions all hammered. Full contagion panic.',
    category: 'counterparty_action',
    severity: 'critical',
    score: 100,
  },
  {
    date: '2023-04-28',
    title: 'First Republic seized — sold to JPMorgan',
    description:
      'First Republic Bank, weakened by SVB contagion, seized by regulators and sold to JPMorgan Chase. Third major bank failure in two months.',
    category: 'counterparty_action',
    severity: 'critical',
    score: 100,
  },
]

export const svb: CaseStudy = {
  id: 'svb',
  name: 'Silicon Valley Bank',
  ticker: 'SIVB',
  subtitle: 'The 44-Hour Collapse',
  period: 'March 2022 – March 2023',
  summary:
    "Silicon Valley Bank was the premier bank for tech startups and venture capital, with deposits that tripled to $189B during the 2020-2021 tech boom. When the Fed began aggressively raising rates in 2022, SVB's massive portfolio of long-duration bonds lost ~$17B in value — roughly equal to its total shareholder equity. As VC funding dried up, tech companies burned through deposits faster. On March 8, 2023, SVB announced it had sold $21B in bonds at a $1.8B loss and needed to raise $2.25B in capital. Within 44 hours, $42B in deposits fled and the FDIC seized the bank — the second-largest bank failure in US history.",
  outcome:
    "An automated system would have flagged SVB at elevated risk by October 2022 — five months before collapse — based on publicly available data. Three signals were unambiguous: (1) unrealized losses roughly equaled total equity (Q3 2022 10-Q filing), (2) deposits were declining in a 95% uninsured, tech-concentrated base, and (3) peer contagion from Silvergate's distress starting January 2023. The actual collapse from announcement to seizure took only 44 hours — by then it was too late. The value is in the months of lead time that quantitative screening provides.",
  timeline,
  lessons: [
    {
      signal: 'Unrealized Losses / Equity',
      threshold: 'Ratio > 50% signals existential solvency risk',
    },
    {
      signal: 'Uninsured Deposit %',
      threshold: '> 80% uninsured creates run vulnerability',
    },
    {
      signal: 'Deposit Growth Rate',
      threshold: 'Negative QoQ deposit growth for 2+ quarters',
    },
    {
      signal: 'Peer Contagion',
      threshold: 'Failure of bank with similar deposit profile',
    },
    {
      signal: 'Insider Selling',
      threshold: 'C-suite sales > $1M within 90 days of stress signals',
    },
    {
      signal: 'Social Media Velocity',
      threshold: 'VC/founder withdrawal posts exceeding 50/hour',
    },
  ],
}
