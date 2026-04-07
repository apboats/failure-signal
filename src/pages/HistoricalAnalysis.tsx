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
    description: 'Reuters reports Bear Stearns cutting 310 mortgage unit jobs as subprime losses mount.',
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
    description: 'Bear Stearns reports its first-ever quarterly loss. Stock drops to ~$91.',
    category: 'stock_drop',
    severity: 'high',
    stockPrice: '~$91',
  },
  {
    date: 'Jan 8, 2008',
    title: 'CEO Cayne replaced by Schwartz',
    description: 'Board ousts Jimmy Cayne after criticism of his absence during the crisis. Alan Schwartz takes over.',
    category: 'executive_departure',
    severity: 'high',
    stockPrice: '~$71',
  },
  {
    date: 'Mar 10, 2008',
    title: 'Liquidity drops $16B; clients pull funds',
    description: 'Internal liquidity falls sharply. Prime brokerage clients begin withdrawing funds in what amounts to a "run on the bank."',
    category: 'client_withdrawal',
    severity: 'critical',
  },
  {
    date: 'Mar 12, 2008',
    title: 'CEO denies liquidity problems on CNBC',
    description: 'CEO Schwartz publicly insists liquidity is "fine" with $17B cash on hand. Markets remain skeptical.',
    category: 'liquidity_warning',
    severity: 'high',
    stockPrice: '~$61',
  },
  {
    date: 'Mar 13, 2008',
    title: 'Trading partners shun Bear Stearns',
    description: 'Reuters reports counterparties refusing to trade, cost of insuring Bear debt spikes. Banks suspend Treasury trading.',
    category: 'counterparty_action',
    severity: 'critical',
  },
  {
    date: 'Mar 13, 2008',
    title: 'CDS spreads explode',
    description: 'Cost of insuring Bear Stearns debt surges to record levels, signaling extreme default risk.',
    category: 'cds_spike',
    severity: 'critical',
  },
  {
    date: 'Mar 14, 2008',
    title: 'Emergency Fed funding; S&P downgrades to BBB-',
    description: 'Bear admits liquidity "significantly deteriorated." Fed authorizes JPMorgan to channel emergency loan. S&P cuts rating. Stock falls 47% to ~$30.',
    category: 'liquidity_warning',
    severity: 'critical',
    stockPrice: '~$30',
  },
  {
    date: 'Mar 14, 2008',
    title: 'Stock crashes 47% in one session',
    description: 'Bear Stearns shares fall from ~$57 to ~$30 in a single trading day — the largest single-day decline.',
    category: 'stock_drop',
    severity: 'critical',
    stockPrice: '~$30',
  },
  {
    date: 'Mar 14, 2008',
    title: 'S&P downgrades to BBB-',
    description: 'Standard & Poor\'s cuts Bear Stearns credit rating to near-junk status.',
    category: 'credit_downgrade',
    severity: 'critical',
  },
  {
    date: 'Mar 16, 2008',
    title: 'JPMorgan acquires Bear for $2/share',
    description: 'JPMorgan agrees to buy Bear Stearns for $2/share (~$236M) with $30B Fed backstop. Without the deal, Bear "would have gone bankrupt."',
    category: 'regulatory_signal',
    severity: 'critical',
    stockPrice: '~$2',
  },
  {
    date: 'Mar 17, 2008',
    title: 'Media declares collapse',
    description: 'ABC News: "Bear Stearns collapsed, and was sold to JPMorgan." First use of "collapsed" in major media.',
    category: 'news_sentiment',
    severity: 'critical',
    stockPrice: '~$5',
  },
]

const severityColors = {
  low: '#6b7280',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

export function HistoricalAnalysis() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Bear Stearns: Anatomy of a Collapse</h2>
        <p className="mt-2 text-sm text-slate-400">
          September 2007 - March 2008. This timeline shows the sequence of warning signals that preceded
          Bear Stearns' near-failure. No major outlet declared Bear Stearns "insolvent" before the JPMorgan
          rescue — the language of collapse appeared only after the deal was announced.
        </p>
      </div>

      {/* Key Insight Box */}
      <div className="mb-8 rounded-xl border border-blue-800 bg-blue-950/30 p-6">
        <h3 className="text-sm font-semibold text-blue-400">Key Insight</h3>
        <p className="mt-2 text-sm text-slate-300">
          Multiple independent signals converged in the final week: client withdrawals accelerated from March 10,
          counterparties stopped trading by March 13, CDS spreads spiked, and the stock fell 47% on March 14.
          A monitoring system tracking these signals would have flagged critical risk 3-4 days before the rescue.
        </p>
      </div>

      {/* Signal Category Legend */}
      <div className="mb-8 flex flex-wrap gap-3">
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
      <div className="relative">
        <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-slate-700" />

        <div className="space-y-6">
          {bearSternsTimeline.map((event, i) => {
            const cat = SIGNAL_CATEGORIES[event.category]
            return (
              <div key={i} className="relative pl-8">
                <div
                  className="absolute left-0 top-1 h-4 w-4 rounded-full border-2"
                  style={{
                    borderColor: severityColors[event.severity],
                    backgroundColor: event.severity === 'critical' ? severityColors.critical : 'transparent',
                  }}
                />
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">{event.date}</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                        >
                          {cat.label}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium capitalize"
                          style={{ color: severityColors[event.severity] }}
                        >
                          {event.severity}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white">{event.title}</h4>
                      <p className="mt-1 text-xs text-slate-400">{event.description}</p>
                    </div>
                    {event.stockPrice && (
                      <span className="whitespace-nowrap text-sm font-mono text-slate-500">
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

      {/* Framework Summary */}
      <div className="mt-10 rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Proposed Early-Warning Thresholds</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { signal: 'Stock Drop', threshold: '>30% intraday decline or >50% over 5 days' },
            { signal: 'CDS Spike', threshold: 'Cost of default insurance > 95th percentile' },
            { signal: 'Liquidity', threshold: 'Emergency funding requests or Fed facility usage' },
            { signal: 'Client Withdrawals', threshold: 'Prime brokerage AUM drop > 10% in a week' },
            { signal: 'Counterparty', threshold: 'Any report of trading partners suspending activity' },
            { signal: 'Credit Rating', threshold: 'Downgrade to BBB or below' },
          ].map((item) => (
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
