import { useState } from 'react'
import { SIGNAL_CATEGORIES } from '../../shared/constants'
import type { SignalCategory } from '../../shared/types'

interface TimelineEvent {
  date: string
  title: string
  description: string
  category: SignalCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  stockPrice?: string
}

interface CaseStudy {
  id: string
  name: string
  ticker: string
  subtitle: string
  dateRange: string
  keyInsight: string
  overview: string
  timeline: TimelineEvent[]
  thresholds: Array<{ signal: string; threshold: string }>
  scoreProgression: Array<{ date: string; score: number; label: string }>
}

// ─── Bear Stearns ────────────────────────────────────────────

const bearSternsTimeline: TimelineEvent[] = [
  {
    date: 'Sep 20, 2007',
    title: 'Q3 profit slumps 62%',
    description: 'The Guardian reports Bear Stearns Q3 profit dropped 62% due to subprime mortgage losses.',
    category: 'news_sentiment',
    severity: 'medium',
    stockPrice: '~$120',
  },
  {
    date: 'Oct 3, 2007',
    title: '310 mortgage jobs cut',
    description: 'Reuters reports Bear Stearns cutting 310 mortgage unit positions.',
    category: 'news_sentiment',
    severity: 'low',
  },
  {
    date: 'Oct 5, 2007',
    title: 'Prosecutors probe hedge funds',
    description: 'Federal prosecutors begin investigating Bear Stearns\' collapsed internal hedge funds.',
    category: 'regulatory_signal',
    severity: 'medium',
  },
  {
    date: 'Dec 20, 2007',
    title: 'First-ever quarterly loss ($859M)',
    description: 'Bear reports unprecedented Q4 loss. Stock at ~$91.',
    category: 'stock_drop',
    severity: 'high',
    stockPrice: '~$91',
  },
  {
    date: 'Jan 8, 2008',
    title: 'CEO Cayne replaced by Schwartz',
    description: 'Board ousts Jimmy Cayne after mounting criticism. Stock at ~$71.',
    category: 'executive_departure',
    severity: 'high',
    stockPrice: '~$71',
  },
  {
    date: 'Mar 10, 2008',
    title: 'Clients pull funds — $16B liquidity drop',
    description: 'Internal liquidity falls sharply as prime brokerage clients begin withdrawing en masse.',
    category: 'client_withdrawal',
    severity: 'critical',
  },
  {
    date: 'Mar 12, 2008',
    title: 'CEO denies liquidity problems on CNBC',
    description: 'Schwartz insists liquidity is fine with $17B cash. Markets skeptical.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$61',
  },
  {
    date: 'Mar 13, 2008',
    title: 'Trading partners shun Bear Stearns',
    description: 'Reuters reports counterparties refusing to trade. Banks suspend Treasury trading with Bear.',
    category: 'counterparty_action',
    severity: 'critical',
  },
  {
    date: 'Mar 13, 2008',
    title: 'CDS spreads explode to record levels',
    description: 'Cost of insuring Bear Stearns debt surges, signaling extreme default risk.',
    category: 'cds_spike',
    severity: 'critical',
  },
  {
    date: 'Mar 14, 2008',
    title: 'Emergency Fed funding requested',
    description: 'Bear admits liquidity significantly deteriorated. Fed authorizes emergency JPMorgan loan.',
    category: 'liquidity_warning',
    severity: 'critical',
    stockPrice: '~$30',
  },
  {
    date: 'Mar 14, 2008',
    title: 'Stock crashes 47% in one session',
    description: 'BSC falls from ~$57 to ~$30 in single day — largest single-day decline.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '~$30',
  },
  {
    date: 'Mar 14, 2008',
    title: 'S&P downgrades to BBB-',
    description: 'Standard & Poor\'s cuts Bear credit rating to near-junk status.',
    category: 'credit_downgrade',
    severity: 'critical',
  },
  {
    date: 'Mar 16, 2008',
    title: 'JPMorgan acquires Bear for $2/share',
    description: 'JPMorgan buys Bear with $30B Fed backstop. Without deal, Bear would have gone bankrupt.',
    category: 'regulatory_signal',
    severity: 'critical',
    stockPrice: '~$2',
  },
  {
    date: 'Mar 17, 2008',
    title: 'Media declares "collapse"',
    description: 'ABC News first major outlet to use "collapsed" — the end of Bear Stearns as independent firm.',
    category: 'news_sentiment',
    severity: 'critical',
    stockPrice: '~$5',
  },
]

// ─── Silicon Valley Bank ─────────────────────────────────────

const svbTimeline: TimelineEvent[] = [
  {
    date: 'Mar 16, 2022',
    title: 'Fed begins rate hike cycle (25bp)',
    description: 'Federal Reserve raises rates for the first time since 2018. SVB holds $91B in long-duration HTM securities — the beginning of a massive unrealized loss accumulation.',
    category: 'liquidity_warning',
    severity: 'low',
    stockPrice: '~$590',
  },
  {
    date: 'May 19, 2022',
    title: 'CEO Becker sells $3.6M in stock',
    description: 'CEO Greg Becker sells shares via SEC Form 4 filing. Fed has raised rates 75bp total. SVB stock already down ~12% from peak.',
    category: 'executive_departure',
    severity: 'low',
    stockPrice: '~$470',
  },
  {
    date: 'Jun 15, 2022',
    title: 'Fed raises 75bp — aggressive tightening',
    description: 'Largest rate hike since 1994. SVB\'s bond portfolio is hemorrhaging unrealized value. Tech sector valuations compress sharply.',
    category: 'liquidity_warning',
    severity: 'medium',
    stockPrice: '~$420',
  },
  {
    date: 'Jul 21, 2022',
    title: 'Q2 earnings: First deposit decline',
    description: 'SVB reports deposits fell from $189B to $181B — the first decline. AFS unrealized losses reach ~$2.5B. Analysts begin flagging concentration risk.',
    category: 'client_withdrawal',
    severity: 'medium',
    stockPrice: '~$395',
  },
  {
    date: 'Oct 20, 2022',
    title: 'Q3 earnings: Unrealized losses reach ~$17B',
    description: 'Deposits decline further to ~$173B. Total unrealized losses across securities portfolios reach ~$15-17B — roughly equal to SVB\'s total shareholder equity. Seeking Alpha publishes bearish analysis.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$280',
  },
  {
    date: 'Nov 2022',
    title: 'Short interest climbs above 5% of float',
    description: 'Bloomberg terminal data shows short interest rising notably. Sophisticated investors betting against SVB. Stock continues declining.',
    category: 'news_sentiment',
    severity: 'medium',
    stockPrice: '~$250',
  },
  {
    date: 'Jan 4, 2023',
    title: 'Silvergate discloses $8.1B deposit outflows',
    description: 'Silvergate Capital (crypto bank) reveals massive Q4 deposit flight. Market scrutiny intensifies on all banks with concentrated, flighty deposit bases — including SVB.',
    category: 'counterparty_action',
    severity: 'medium',
    stockPrice: '~$245',
  },
  {
    date: 'Jan 19, 2023',
    title: 'Q4 earnings: $15.1B HTM unrealized losses confirmed',
    description: 'SVB confirms deposits flat at ~$173B and HTM unrealized losses of $15.1B in footnotes. Management projects further deposit declines in 2023. Market skeptical despite reassurance.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$270',
  },
  {
    date: 'Jan 26, 2023',
    title: 'CEO Becker sells $3.6M more stock',
    description: 'CEO sells additional shares under 10b5-1 plan, approximately 6 weeks before collapse. Later reported by WSJ.',
    category: 'executive_departure',
    severity: 'medium',
    stockPrice: '~$280',
  },
  {
    date: 'Feb 2023',
    title: 'VCs privately advise deposit diversification',
    description: 'Peter Thiel\'s Founders Fund and other VC firms quietly begin advising portfolio companies to move money out of SVB. Not yet public but deposit outflows accelerate.',
    category: 'client_withdrawal',
    severity: 'high',
  },
  {
    date: 'Mar 1, 2023',
    title: 'Silvergate delays 10-K filing',
    description: 'Silvergate announces it cannot file annual report on time, raising going-concern doubts. Peer contagion risk for SVB spikes.',
    category: 'counterparty_action',
    severity: 'high',
    stockPrice: '~$284',
  },
  {
    date: 'Mar 8, 2023',
    title: 'Silvergate announces voluntary liquidation',
    description: 'Silvergate Capital will wind down and liquidate. This is the immediate catalyst that puts SVB under maximum scrutiny from investors and depositors.',
    category: 'counterparty_action',
    severity: 'critical',
    stockPrice: '~$267',
  },
  {
    date: 'Mar 8, 2023',
    title: 'SVB announces $1.8B loss + $2.25B capital raise',
    description: 'After market close, SVB reveals it sold $21B in AFS securities at a $1.8B loss and plans to raise $2.25B in equity. The simultaneous loss realization + dilutive raise triggers panic. Stock drops ~7% after-hours.',
    category: 'liquidity_warning',
    severity: 'critical',
    stockPrice: '~$248 AH',
  },
  {
    date: 'Mar 9, 2023',
    title: 'Stock crashes 60% — VCs tell companies to flee',
    description: 'SIVB opens at ~$180, closes at $106. Founders Fund, Coatue, Union Square Ventures, Y Combinator all publicly advise portfolio companies to pull deposits. $42B in withdrawals requested in a single day.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '$106',
  },
  {
    date: 'Mar 9, 2023',
    title: '$42 billion in withdrawal requests',
    description: 'Customers attempt to withdraw $42B — roughly 25% of total deposits — in a single day. A 21st-century digital bank run amplified by Twitter and VC group chats.',
    category: 'client_withdrawal',
    severity: 'critical',
  },
  {
    date: 'Mar 9, 2023',
    title: 'Moody\'s downgrades SVB three notches',
    description: 'Moody\'s cuts SVB Financial Group from A3 to Baa1 — a three-notch downgrade — and places on review for further downgrade.',
    category: 'credit_downgrade',
    severity: 'critical',
  },
  {
    date: 'Mar 10, 2023',
    title: 'Trading halted pre-market',
    description: 'SIVB stock halted after dropping to ~$35 in pre-market. CEO Becker makes a final call asking depositors to "stay calm." Bank had negative cash balance of -$958M.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '~$35 (halted)',
  },
  {
    date: 'Mar 10, 2023',
    title: 'FDIC seizes SVB — 2nd largest bank failure in US history',
    description: 'California DFPI closes Silicon Valley Bank at 11:30 AM ET. FDIC appointed as receiver. Second-largest bank failure in US history after Washington Mutual (2008).',
    category: 'regulatory_signal',
    severity: 'critical',
  },
  {
    date: 'Mar 12, 2023',
    title: 'Full depositor guarantee + Signature Bank closed',
    description: 'Treasury, Fed, and FDIC guarantee all SVB and Signature Bank depositors. Fed launches Bank Term Funding Program (BTFP). Signature Bank also closed by NY regulators.',
    category: 'regulatory_signal',
    severity: 'critical',
  },
  {
    date: 'Mar 13, 2023',
    title: 'Contagion: First Republic drops 60%, regionals crater',
    description: 'First Republic Bank stock drops ~60%. Regional bank index falls ~12%. PacWest, Western Alliance, Zions all hammered. Full contagion panic.',
    category: 'counterparty_action',
    severity: 'critical',
  },
  {
    date: 'Apr 28, 2023',
    title: 'First Republic seized — sold to JPMorgan',
    description: 'First Republic Bank, weakened by SVB contagion, seized by regulators and sold to JPMorgan Chase. Third major bank failure in two months.',
    category: 'counterparty_action',
    severity: 'critical',
  },
]

// ─── Case Studies ────────────────────────────────────────────

const caseStudies: CaseStudy[] = [
  {
    id: 'svb',
    name: 'Silicon Valley Bank',
    ticker: 'SIVB',
    subtitle: 'The 44-Hour Collapse',
    dateRange: 'March 2022 - March 2023',
    overview: 'Silicon Valley Bank was the premier bank for tech startups and venture capital, with deposits that tripled to $189B during the 2020-2021 tech boom. When the Fed began aggressively raising rates in 2022, SVB\'s massive portfolio of long-duration bonds lost ~$17B in value — roughly equal to its total shareholder equity. As VC funding dried up, tech companies burned through deposits faster. On March 8, 2023, SVB announced it had sold $21B in bonds at a $1.8B loss and needed to raise $2.25B in capital. Within 44 hours, $42B in deposits fled and the FDIC seized the bank — the second-largest bank failure in US history.',
    keyInsight: 'An automated system would have flagged SVB at elevated risk by October 2022 — five months before collapse — based on publicly available data. Three signals were unambiguous: (1) unrealized losses roughly equaled total equity (Q3 2022 10-Q filing), (2) deposits were declining in a 95% uninsured, tech-concentrated base, and (3) peer contagion from Silvergate\'s distress starting January 2023. The actual collapse from announcement to seizure took only 44 hours — by then it was too late. The value is in the months of lead time that quantitative screening provides.',
    timeline: svbTimeline,
    thresholds: [
      { signal: 'Unrealized Losses / Equity', threshold: 'Ratio > 50% signals existential solvency risk' },
      { signal: 'Uninsured Deposit %', threshold: '> 80% uninsured creates run vulnerability' },
      { signal: 'Deposit Growth Rate', threshold: 'Negative QoQ deposit growth for 2+ quarters' },
      { signal: 'Peer Contagion', threshold: 'Failure of bank with similar deposit profile' },
      { signal: 'Insider Selling', threshold: 'C-suite sales > $1M within 90 days of stress signals' },
      { signal: 'Social Media Velocity', threshold: 'VC/founder withdrawal posts exceeding 50/hour' },
    ],
    scoreProgression: [
      { date: 'Dec 2021', score: 8, label: 'Peak deposits, $91B HTM portfolio' },
      { date: 'Mar 2022', score: 15, label: 'Rate hikes begin' },
      { date: 'Jun 2022', score: 28, label: 'Stock down 38%, losses growing' },
      { date: 'Oct 2022', score: 42, label: 'First deposit decline, losses ≈ equity' },
      { date: 'Dec 2022', score: 52, label: 'Short interest rising, Silvergate stress' },
      { date: 'Jan 2023', score: 55, label: 'Q4 confirms deposit weakness' },
      { date: 'Feb 2023', score: 62, label: 'VCs privately moving deposits' },
      { date: 'Mar 1', score: 68, label: 'Silvergate delays 10-K' },
      { date: 'Mar 8 (pre)', score: 72, label: 'Silvergate liquidates' },
      { date: 'Mar 8 (post)', score: 88, label: '$1.8B loss + capital raise' },
      { date: 'Mar 9', score: 96, label: '60% crash, $42B run, downgrade' },
      { date: 'Mar 10', score: 100, label: 'FDIC seizure' },
    ],
  },
  {
    id: 'bear',
    name: 'Bear Stearns',
    ticker: 'BSC',
    subtitle: 'The Original "Run on the Bank"',
    dateRange: 'September 2007 - March 2008',
    overview: 'Bear Stearns was the fifth-largest US investment bank. Heavily exposed to subprime mortgage securities, it began showing cracks in late 2007 with its first-ever quarterly loss. In March 2008, a classic run on the bank unfolded over just five days: clients withdrew funds, counterparties refused to trade, and CDS spreads exploded. No major outlet declared Bear "insolvent" before the rescue — the language of collapse appeared only after JPMorgan\'s $2/share takeover was announced on March 16, 2008.',
    keyInsight: 'Multiple independent signals converged in the final week: client withdrawals accelerated from March 10, counterparties stopped trading by March 13, CDS spreads spiked, and the stock fell 47% on March 14. A monitoring system tracking these signals would have flagged critical risk 3-4 days before the rescue. Earlier signals — the first-ever quarterly loss (Dec 2007) and CEO replacement (Jan 2008) — would have elevated the score months prior.',
    timeline: bearSternsTimeline,
    thresholds: [
      { signal: 'Stock Drop', threshold: '>30% intraday decline or >50% over 5 days' },
      { signal: 'CDS Spike', threshold: 'Cost of default insurance > 95th percentile' },
      { signal: 'Liquidity', threshold: 'Emergency funding requests or Fed facility usage' },
      { signal: 'Client Withdrawals', threshold: 'Prime brokerage AUM drop > 10% in a week' },
      { signal: 'Counterparty', threshold: 'Any report of trading partners suspending activity' },
      { signal: 'Credit Rating', threshold: 'Downgrade to BBB or below' },
    ],
    scoreProgression: [
      { date: 'Sep 2007', score: 8.5, label: 'Q3 profit slumps 62%' },
      { date: 'Oct 2007', score: 12, label: 'Job cuts, prosecutor probe' },
      { date: 'Dec 2007', score: 22.5, label: 'First-ever quarterly loss' },
      { date: 'Jan 2008', score: 30, label: 'CEO replaced' },
      { date: 'Mar 10', score: 45, label: 'Client withdrawals begin' },
      { date: 'Mar 12', score: 58, label: 'CEO denies problems on CNBC' },
      { date: 'Mar 13', score: 78, label: 'Counterparties flee, CDS explode' },
      { date: 'Mar 14', score: 95.5, label: 'Fed funding, 47% crash, downgrade' },
      { date: 'Mar 16', score: 98, label: 'JPMorgan buys for $2/share' },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────

const severityColors = {
  low: '#6b7280',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

export function HistoricalAnalysis() {
  const [activeStudy, setActiveStudy] = useState('svb')
  const study = caseStudies.find((s) => s.id === activeStudy)!

  return (
    <div className="mx-auto max-w-4xl">
      {/* Tab Selector */}
      <div className="mb-4 flex gap-2 md:mb-6">
        {caseStudies.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveStudy(s.id)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:py-2.5 md:text-sm ${
              activeStudy === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {s.name} ({s.ticker})
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl font-bold text-white md:text-2xl">
          {study.name}: {study.subtitle}
        </h2>
        <p className="mt-1 text-xs text-slate-500 md:text-sm">{study.dateRange}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400 md:mt-3 md:text-sm">{study.overview}</p>
      </div>

      {/* Key Insight */}
      <div className="mb-6 rounded-xl border border-blue-800 bg-blue-950/30 p-4 md:mb-8 md:p-6">
        <h3 className="text-sm font-semibold text-blue-400">Key Insight</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-300 md:text-sm">{study.keyInsight}</p>
      </div>

      {/* Risk Score Progression */}
      <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:mb-8 md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-white md:mb-4">Risk Score Progression</h3>
        <div className="space-y-2">
          {study.scoreProgression.map((point, i) => {
            const color =
              point.score >= 80 ? '#dc2626' :
              point.score >= 60 ? '#ef4444' :
              point.score >= 40 ? '#f97316' :
              point.score >= 20 ? '#eab308' :
              '#22c55e'
            return (
              <div key={i}>
                {/* Mobile: stacked layout */}
                <div className="flex items-center gap-2 md:hidden">
                  <span className="w-16 shrink-0 text-right text-[10px] text-slate-500">{point.date}</span>
                  <div className="flex-1">
                    <div className="h-4 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="flex h-full items-center rounded-full px-1.5 text-[10px] font-bold"
                        style={{
                          width: `${Math.max(point.score, 4)}%`,
                          backgroundColor: color,
                          color: point.score > 20 ? 'white' : 'transparent',
                        }}
                      >
                        {point.score > 20 ? `${point.score}%` : ''}
                      </div>
                    </div>
                  </div>
                  {point.score <= 20 && (
                    <span className="text-[10px] font-bold" style={{ color }}>{point.score}%</span>
                  )}
                </div>
                <p className="mt-0.5 pl-[72px] text-[10px] text-slate-500 md:hidden">{point.label}</p>
                {/* Desktop: single row */}
                <div className="hidden items-center gap-3 md:flex">
                  <span className="w-24 shrink-0 text-right text-xs text-slate-500">{point.date}</span>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="flex h-full items-center rounded-full px-2 text-xs font-bold transition-all"
                        style={{
                          width: `${Math.max(point.score, 3)}%`,
                          backgroundColor: color,
                          color: point.score > 15 ? 'white' : 'transparent',
                        }}
                      >
                        {point.score > 15 ? `${point.score}%` : ''}
                      </div>
                    </div>
                  </div>
                  {point.score <= 15 && (
                    <span className="text-xs font-bold" style={{ color }}>{point.score}%</span>
                  )}
                  <span className="w-64 shrink-0 text-xs text-slate-500">{point.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Signal Category Legend */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(SIGNAL_CATEGORIES).map(([key, val]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            style={{ backgroundColor: `${val.color}15`, color: val.color }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: val.color }} />
            {val.label}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative mb-8 md:mb-10">
        <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-slate-700" />

        <div className="space-y-3 md:space-y-4">
          {study.timeline.map((event, i) => {
            const cat = SIGNAL_CATEGORIES[event.category]
            return (
              <div key={i} className="relative pl-7 md:pl-8">
                <div
                  className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 md:h-4 md:w-4"
                  style={{
                    borderColor: severityColors[event.severity],
                    backgroundColor: event.severity === 'critical' ? severityColors.critical : 'transparent',
                  }}
                />
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 md:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-medium text-slate-500 md:text-xs">{event.date}</span>
                        <span
                          className="rounded px-1 py-0.5 text-[10px] font-medium md:px-1.5 md:text-xs"
                          style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                        >
                          {cat.label}
                        </span>
                        <span
                          className="text-[10px] font-medium capitalize md:text-xs"
                          style={{ color: severityColors[event.severity] }}
                        >
                          {event.severity}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-white md:text-sm">{event.title}</h4>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-400 md:text-xs">{event.description}</p>
                    </div>
                    {event.stockPrice && (
                      <span className="shrink-0 whitespace-nowrap font-mono text-xs text-slate-500 md:text-sm">
                        {event.stockPrice}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Early Warning Thresholds */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 md:p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Proposed Early-Warning Thresholds</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
          {study.thresholds.map((item) => (
            <div key={item.signal} className="rounded-lg bg-slate-900 p-3">
              <div className="text-xs font-medium text-slate-300">{item.signal}</div>
              <div className="mt-1 text-xs text-slate-500">{item.threshold}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
