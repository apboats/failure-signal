/**
 * Two rules that keep one event from inflating scores, as pure functions so
 * vitest covers them under Node.
 *
 * 1. Peer contagion (compute-risk-score). A bank's jump is passed on to its
 *    sector peers only when funding-type evidence drove it: liquidity
 *    warnings, deposit outflows, CDS spikes or counterparties pulling back.
 *    That is how SVB spread to First Republic and Signature. A compliance
 *    scandal, a lawsuit or a share-price drop at one bank is idiosyncratic and
 *    no longer flags every bank sharing the "banking" label (on 2026-11-19 the
 *    Deutsche Bank leak raised peer_contagion on 49 unrelated banks).
 *
 * 2. Signal de-duplication (process-articles). Ten articles about the same
 *    event used to produce ten signals of each category. A new signal is now
 *    dropped when the same bank already has one of the same category within
 *    DEDUPE_WINDOW_DAYS at equal or higher severity; an escalation (higher
 *    severity) is still recorded.
 */

export const FUNDING_CATEGORIES: ReadonlySet<string> = new Set([
  'liquidity_warning',
  'client_withdrawal',
  'cds_spike',
  'counterparty_action',
])

/** Share of a raw-score increase that must come from funding categories to count as contagion. */
export const FUNDING_SHARE_FOR_CONTAGION = 0.5

/** Raw (pre-display) contribution of the funding categories: sum of weight x capped evidence. */
export function fundingContribution(
  components: Record<string, unknown> | null | undefined,
  weightFor: (category: string) => number,
): number {
  let total = 0
  for (const [category, value] of Object.entries(components ?? {})) {
    if (!FUNDING_CATEGORIES.has(category)) continue
    const evidence = Number(value)
    if (!Number.isFinite(evidence)) continue
    total += Math.min(evidence, 100) * weightFor(category)
  }
  return total
}

export interface ContagionInput {
  currentRaw: number
  prevRaw: number
  currentComponents: Record<string, unknown>
  prevComponents: Record<string, unknown> | null
  weightFor: (category: string) => number
}

/** True when at least half of the raw increase came from funding-type categories. */
export function isFundingDriven(input: ContagionInput): boolean {
  const rawIncrease = input.currentRaw - input.prevRaw
  if (!(rawIncrease > 0)) return false
  const fundingIncrease =
    fundingContribution(input.currentComponents, input.weightFor) -
    fundingContribution(input.prevComponents, input.weightFor)
  return fundingIncrease >= FUNDING_SHARE_FOR_CONTAGION * rawIncrease
}

export const DEDUPE_WINDOW_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

const SEVERITY_RANK: Readonly<Record<string, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

export interface SignalLike {
  category: string
  severity: string
  signal_date: string
}

function rank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 0
}

function within(a: string, b: string): boolean {
  const gap = Math.abs(Date.parse(a) - Date.parse(b))
  return Number.isFinite(gap) && gap <= DEDUPE_WINDOW_DAYS * DAY_MS
}

/**
 * The candidates worth inserting for one bank, given the bank's existing
 * signals near the same dates. Within the batch, one signal per category is
 * kept (the most severe). Against existing signals, a candidate survives only
 * when no same-category signal within the window is at least as severe.
 */
export function dedupeSignals<T extends SignalLike>(
  candidates: readonly T[],
  existing: readonly SignalLike[],
): T[] {
  const bestPerCategory = new Map<string, T>()
  for (const signal of candidates) {
    const current = bestPerCategory.get(signal.category)
    if (!current || rank(signal.severity) > rank(current.severity))
      bestPerCategory.set(signal.category, signal)
  }
  return [...bestPerCategory.values()].filter(
    (signal) =>
      !existing.some(
        (old) =>
          old.category === signal.category &&
          rank(old.severity) >= rank(signal.severity) &&
          within(old.signal_date, signal.signal_date),
      ),
  )
}
