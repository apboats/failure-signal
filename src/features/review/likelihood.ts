import type { Tone } from '@shared/types'

export interface LikelihoodLabel {
  label: string
  tone: Tone
  /** '87%' or '—' when classify-pending has not checked the row yet. */
  percent: string
}

/** Cut-offs for the badge; the full estimate is always shown next to it. */
export const LIKELY = 0.7
export const POSSIBLE = 0.4

/**
 * Badge text and tone for a us_bank_probability value. Accent for likely,
 * amber for a judgement call, neutral otherwise: this is a classification, so
 * the risk ramp and the red/green valence colours do not apply.
 */
export function likelihoodLabel(
  probability: number | null | undefined,
): LikelihoodLabel {
  if (probability === null || probability === undefined)
    return { label: 'Not checked yet', tone: 'neutral', percent: '—' }
  const percent = `${Math.round(probability * 100)}%`
  if (probability >= LIKELY)
    return { label: 'Likely a US bank', tone: 'accent', percent }
  if (probability >= POSSIBLE)
    return { label: 'Possibly a US bank', tone: 'sev-medium', percent }
  return { label: 'Unlikely a US bank', tone: 'neutral', percent }
}
