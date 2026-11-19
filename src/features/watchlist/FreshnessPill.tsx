import { cx, Skeleton } from '@/components/ui'
import { formatDate, formatDateTimeUTC } from '@/lib/format'
import { useFreshness } from '@/queries/useFreshness'
import {
  CRON_CADENCE,
  isSameUtcDay,
  pricesTone,
  scoresTone,
  signalsTone,
  type FreshnessTone,
} from './freshness'
import { useNow } from './useWatchlistData'

const PILL =
  'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-surface-2 px-3 py-1 text-xs text-muted tabular-nums'

/** Lateness colours: amber past the first threshold, red past the second. */
const TONE_CLASS: Record<FreshnessTone, string> = {
  ok: 'text-text',
  late: 'text-sev-medium',
  stale: 'text-sev-critical',
  info: 'text-text',
  missing: 'text-muted',
}

const TONE_WORD: Record<FreshnessTone, string> = {
  ok: 'on time',
  late: 'late',
  stale: 'stale',
  info: '',
  missing: 'no data',
}

function Segment({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: FreshnessTone
}) {
  const word = TONE_WORD[tone]
  return (
    <span className="whitespace-nowrap">
      {label}{' '}
      <span className={cx('font-medium', TONE_CLASS[tone])}>{value}</span>
      {word ? <span className="sr-only"> ({word})</span> : null}
    </span>
  )
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-muted">
      ·
    </span>
  )
}

/** Clock time in UTC; the date is added once the timestamp is not from today. */
function clock(iso: string | null, now: number): string {
  if (!iso) return formatDateTimeUTC(null)
  return formatDateTimeUTC(iso, { withDate: !isSameUtcDay(iso, now) })
}

export interface FreshnessPillProps {
  className?: string
}

/**
 * "Scores 12:15 UTC · Prices Nov 17 · Signals 09:40 UTC": when each pipeline
 * stage last produced data. Scores go amber past 2 h and red past 6 h; prices
 * amber past one business day behind and red past three; signals are shown
 * without a colour since a quiet hour legitimately yields none. The tooltip
 * lists the expected cadence. Shared by the Watchlist header and the app Header.
 */
export function FreshnessPill({ className }: FreshnessPillProps) {
  const query = useFreshness()
  const now = useNow()

  if (query.isPending) {
    return <Skeleton inline className={cx('h-6 w-64', className)} />
  }
  if (query.isError) {
    return (
      <span
        title={query.error.message}
        className={cx(PILL, 'text-sev-critical', className)}
      >
        Freshness unavailable
      </span>
    )
  }

  const { scoresAt, pricesDate, signalsAt } = query.data
  return (
    <span title={CRON_CADENCE} className={cx(PILL, className)}>
      <span className="sr-only">Pipeline freshness. {CRON_CADENCE}.</span>
      <Segment
        label="Scores"
        value={clock(scoresAt, now)}
        tone={scoresTone(scoresAt, now)}
      />
      <Dot />
      <Segment
        label="Prices"
        value={formatDate(pricesDate, 'MMM d')}
        tone={pricesTone(pricesDate, now)}
      />
      <Dot />
      <Segment
        label="Signals"
        value={clock(signalsAt, now)}
        tone={signalsTone(signalsAt)}
      />
    </span>
  )
}
