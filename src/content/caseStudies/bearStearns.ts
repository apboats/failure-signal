import type { CaseStudy, TimelineEvent } from './types'

/*
 * Every event below is carried over verbatim from the retired
 * HistoricalAnalysis page (14 events). Dates are ISO.
 *
 * Scores are modelled, not measured: the live index did not exist in 2008.
 * They follow the 0–100 progression the retired page drew, mapped band for
 * band onto the live index (its 20/40/60/80 ladder onto the SHORT_EXIT /
 * WATCH / SHORT_ENTRY / SEVERE edges 5/8/15/25, and 100 onto 35, just past
 * the live all-time high of 33.5), then interpolated for the events between
 * that progression's anchors.
 */
const timeline: readonly TimelineEvent[] = [
  {
    date: '2007-09-20',
    title: 'Q3 profit slumps 62%',
    description:
      'The Guardian reports Bear Stearns Q3 profit dropped 62% due to subprime mortgage losses.',
    category: 'news_sentiment',
    severity: 'medium',
    stockPrice: '~$120',
    score: 8.5,
  },
  {
    date: '2007-10-03',
    title: '310 mortgage jobs cut',
    description:
      'Reuters reports Bear Stearns cutting 310 mortgage unit positions.',
    category: 'news_sentiment',
    severity: 'low',
    score: 10,
  },
  {
    date: '2007-10-05',
    title: 'Prosecutors probe hedge funds',
    description:
      "Federal prosecutors begin investigating Bear Stearns' collapsed internal hedge funds.",
    category: 'regulatory_signal',
    severity: 'medium',
    score: 12,
  },
  {
    date: '2007-12-20',
    title: 'First-ever quarterly loss ($859M)',
    description: 'Bear reports unprecedented Q4 loss. Stock at ~$91.',
    category: 'stock_drop',
    severity: 'high',
    stockPrice: '~$91',
    score: 22.5,
  },
  {
    date: '2008-01-08',
    title: 'CEO Cayne replaced by Schwartz',
    description:
      'Board ousts Jimmy Cayne after mounting criticism. Stock at ~$71.',
    category: 'executive_departure',
    severity: 'high',
    stockPrice: '~$71',
    score: 30,
  },
  {
    date: '2008-03-10',
    title: 'Clients pull funds — $16B liquidity drop',
    description:
      'Internal liquidity falls sharply as prime brokerage clients begin withdrawing en masse.',
    category: 'client_withdrawal',
    severity: 'critical',
    score: 45,
  },
  {
    date: '2008-03-12',
    title: 'CEO denies liquidity problems on CNBC',
    description:
      'Schwartz insists liquidity is fine with $17B cash. Markets skeptical.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$61',
    score: 58,
  },
  {
    date: '2008-03-13',
    title: 'Trading partners shun Bear Stearns',
    description:
      'Reuters reports counterparties refusing to trade. Banks suspend Treasury trading with Bear.',
    category: 'counterparty_action',
    severity: 'critical',
    score: 70,
  },
  {
    date: '2008-03-13',
    title: 'CDS spreads explode to record levels',
    description:
      'Cost of insuring Bear Stearns debt surges, signaling extreme default risk.',
    category: 'cds_spike',
    severity: 'critical',
    score: 78,
  },
  {
    date: '2008-03-14',
    title: 'Emergency Fed funding requested',
    description:
      'Bear admits liquidity significantly deteriorated. Fed authorizes emergency JPMorgan loan.',
    category: 'liquidity_warning',
    severity: 'critical',
    stockPrice: '~$30',
    score: 88,
  },
  {
    date: '2008-03-14',
    title: 'Stock crashes 47% in one session',
    description:
      'BSC falls from ~$57 to ~$30 in single day — largest single-day decline.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '~$30',
    score: 93,
  },
  {
    date: '2008-03-14',
    title: 'S&P downgrades to BBB-',
    description:
      "Standard & Poor's cuts Bear credit rating to near-junk status.",
    category: 'credit_downgrade',
    severity: 'critical',
    score: 95.5,
  },
  {
    date: '2008-03-16',
    title: 'JPMorgan acquires Bear for $2/share',
    description:
      'JPMorgan buys Bear with $30B Fed backstop. Without deal, Bear would have gone bankrupt.',
    category: 'regulatory_signal',
    severity: 'critical',
    stockPrice: '~$2',
    score: 98,
  },
  {
    date: '2008-03-17',
    title: 'Media declares "collapse"',
    description:
      'ABC News first major outlet to use "collapsed" — the end of Bear Stearns as independent firm.',
    category: 'news_sentiment',
    severity: 'critical',
    stockPrice: '~$5',
    score: 98,
  },
]

export const bearStearns: CaseStudy = {
  id: 'bear',
  name: 'Bear Stearns',
  ticker: 'BSC',
  subtitle: 'The Original "Run on the Bank"',
  period: 'September 2007 – March 2008',
  summary:
    'Bear Stearns was the fifth-largest US investment bank. Heavily exposed to subprime mortgage securities, it began showing cracks in late 2007 with its first-ever quarterly loss. In March 2008, a classic run on the bank unfolded over just five days: clients withdrew funds, counterparties refused to trade, and CDS spreads exploded. No major outlet declared Bear "insolvent" before the rescue — the language of collapse appeared only after JPMorgan\'s $2/share takeover was announced on March 16, 2008.',
  outcome:
    'Multiple independent signals converged in the final week: client withdrawals accelerated from March 10, counterparties stopped trading by March 13, CDS spreads spiked, and the stock fell 47% on March 14. A monitoring system tracking these signals would have flagged critical risk 3-4 days before the rescue. Earlier signals — the first-ever quarterly loss (Dec 2007) and CEO replacement (Jan 2008) — would have elevated the score months prior.',
  timeline,
  lessons: [
    {
      signal: 'Stock Drop',
      threshold: '>30% intraday decline or >50% over 5 days',
    },
    {
      signal: 'CDS Spike',
      threshold: 'Cost of default insurance > 95th percentile',
    },
    {
      signal: 'Liquidity',
      threshold: 'Emergency funding requests or Fed facility usage',
    },
    {
      signal: 'Client Withdrawals',
      threshold: 'Prime brokerage AUM drop > 10% in a week',
    },
    {
      signal: 'Counterparty',
      threshold: 'Any report of trading partners suspending activity',
    },
    {
      signal: 'Credit Rating',
      threshold: 'Downgrade to BBB or below',
    },
  ],
}
