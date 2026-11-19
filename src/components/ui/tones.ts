import type { Tone } from '@shared/types'

/*
 * Full class strings per tone so Tailwind's scanner sees every utility.
 * Badge: 15% tint of the tone colour behind text in the tone colour.
 */
export const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-muted/15 text-muted',
  accent: 'bg-accent/15 text-accent',
  pos: 'bg-pos/15 text-pos',
  neg: 'bg-neg/15 text-neg',
  'risk-1': 'bg-risk-1/15 text-risk-1',
  'risk-2': 'bg-risk-2/15 text-risk-2',
  'risk-3': 'bg-risk-3/15 text-risk-3',
  'risk-4': 'bg-risk-4/15 text-risk-4',
  'risk-5': 'bg-risk-5/15 text-risk-5',
  'sev-low': 'bg-sev-low/15 text-sev-low',
  'sev-medium': 'bg-sev-medium/15 text-sev-medium',
  'sev-high': 'bg-sev-high/15 text-sev-high',
  'sev-critical': 'bg-sev-critical/15 text-sev-critical',
}

export const TEXT_TONE: Record<Tone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  pos: 'text-pos',
  neg: 'text-neg',
  'risk-1': 'text-risk-1',
  'risk-2': 'text-risk-2',
  'risk-3': 'text-risk-3',
  'risk-4': 'text-risk-4',
  'risk-5': 'text-risk-5',
  'sev-low': 'text-sev-low',
  'sev-medium': 'text-sev-medium',
  'sev-high': 'text-sev-high',
  'sev-critical': 'text-sev-critical',
}

export const BG_TONE: Record<Tone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  pos: 'bg-pos',
  neg: 'bg-neg',
  'risk-1': 'bg-risk-1',
  'risk-2': 'bg-risk-2',
  'risk-3': 'bg-risk-3',
  'risk-4': 'bg-risk-4',
  'risk-5': 'bg-risk-5',
  'sev-low': 'bg-sev-low',
  'sev-medium': 'bg-sev-medium',
  'sev-high': 'bg-sev-high',
  'sev-critical': 'bg-sev-critical',
}
