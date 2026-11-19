/**
 * Risk-score thresholds: the single place to change when the scoring scale moves.
 *
 * No imports and no runtime dependencies on purpose. This file is copied
 * byte-for-byte to supabase/functions/_shared/thresholds.ts so the Deno edge
 * functions and the browser app agree on every band edge.
 *
 * SCALE. compute-risk-score builds a raw composite (weighted, decayed signal
 * evidence; see that function's header) and stores the display score
 *   display = 100 x (1 - exp(-raw / SCORE_SCALE))
 * The raw composite is structurally pinned near zero under normal conditions
 * (per-category caps times sub-1 weights; the live maximum since April 2026
 * was 33.5 and most days are below 7), so the saturating transform spreads the
 * useful range over 0-100: raw 5 -> 27, 8 -> 39, 15 -> 61, 25 -> 79, 33.5 -> 88,
 * and an SVB-like day (raw ~54) -> 97. It is monotone and invertible, so the
 * ordering of every historical row is unchanged; supabase/ops/08 applied it
 * once to the stored history.
 *
 * The five band edges below are on the display scale and were chosen so the
 * old raw thresholds (5 / 8 / 15 / 25) land on round numbers.
 */

/** Raw-composite scale of the saturating transform. */
export const SCORE_SCALE = 16

/** Display score (0-100) for a raw composite. */
export function toDisplayScore(raw: number): number {
  return 100 * (1 - Math.exp(-Math.max(0, raw) / SCORE_SCALE))
}

/** Raw composite for a display score (inverse of toDisplayScore). */
export function fromDisplayScore(display: number): number {
  const clamped = Math.min(Math.max(display, 0), 99.999)
  return -SCORE_SCALE * Math.log(1 - clamped / 100)
}

/** A short is closed when the score falls below this. Also the top of the "Low" band. */
export const SHORT_EXIT = 25

/** A bank goes on watch at or above this. "Elevated or above" everywhere means score >= WATCH. */
export const WATCH = 40

/** A short entry is signalled at or above this. */
export const SHORT_ENTRY = 60

/** Start of the "Critical" band. Score chart axes never top out below this. */
export const SEVERE = 80

/** A one-day jump of this many points is a spike signal on its own. */
export const SCORE_SPIKE = 15
