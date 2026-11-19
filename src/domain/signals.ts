import {
  SENTIMENT_LEVELS,
  SEVERITY_LEVELS,
  SIGNAL_CATEGORIES,
  TRADING_SIGNAL_TYPES,
} from '@shared/constants'
import type {
  ScoreComponents,
  SentimentLabel,
  SeverityToken,
  SignalCategory,
  SignalSeverity,
  Tone,
  TradingSignalType,
} from '@shared/types'

export {
  SENTIMENT_LEVELS,
  SEVERITY_LEVELS,
  SIGNAL_CATEGORIES,
  TRADING_SIGNAL_TYPES,
}

/** Categories in display order (the order of SIGNAL_CATEGORIES). */
export const SIGNAL_CATEGORY_KEYS: readonly SignalCategory[] = Object.keys(
  SIGNAL_CATEGORIES,
) as SignalCategory[]

export function isSignalCategory(value: string): value is SignalCategory {
  return Object.prototype.hasOwnProperty.call(SIGNAL_CATEGORIES, value)
}

export function categoryLabel(category: SignalCategory): string {
  return SIGNAL_CATEGORIES[category].label
}

/** Dot/accent colour for a category. Never a row background. */
export function categoryColor(category: SignalCategory): string {
  return SIGNAL_CATEGORIES[category].color
}

export function severityLabel(severity: SignalSeverity): string {
  return SEVERITY_LEVELS[severity].label
}

export function severityTone(severity: SignalSeverity): SeverityToken {
  return SEVERITY_LEVELS[severity].tone
}

/** 0 (low) .. 3 (critical), for sorting. */
export function severityRank(severity: SignalSeverity): number {
  return SEVERITY_LEVELS[severity].rank
}

export function sentimentLabel(sentiment: SentimentLabel): string {
  return SENTIMENT_LEVELS[sentiment].label
}

export function sentimentTone(sentiment: SentimentLabel): Tone {
  return SENTIMENT_LEVELS[sentiment].tone
}

export function tradingSignalLabel(type: TradingSignalType): string {
  return TRADING_SIGNAL_TYPES[type].label
}

export function tradingSignalTone(type: TradingSignalType): Tone {
  return TRADING_SIGNAL_TYPES[type].tone
}

export interface ComponentEntry {
  category: SignalCategory
  label: string
  color: string
  /** Normalised evidence 0-100 for the category (weight-free). */
  value: number
}

/**
 * The categories with evidence in a score_components map, largest first.
 * Skips unknown keys and non-positive values; safe for the sparse live JSON.
 */
export function componentEntries(
  components: ScoreComponents | null | undefined,
): ComponentEntry[] {
  if (!components) return []
  const entries: ComponentEntry[] = []
  for (const [key, value] of Object.entries(components)) {
    if (!isSignalCategory(key) || typeof value !== 'number' || !(value > 0))
      continue
    entries.push({
      category: key,
      label: categoryLabel(key),
      color: categoryColor(key),
      value,
    })
  }
  return entries.sort((a, b) => b.value - a.value)
}
