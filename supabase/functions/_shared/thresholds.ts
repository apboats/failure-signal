/**
 * Risk-score thresholds: the single place to change when the scoring scale moves.
 *
 * No imports and no runtime dependencies on purpose. This file is copied
 * byte-for-byte to supabase/functions/_shared/thresholds.ts so the Deno edge
 * functions and the browser app agree on every band edge.
 *
 * Calibrated to the live distribution of risk_scores (max ever 33.5, p90 ~ 8,
 * p97 ~ 15). The five risk bands in shared/constants.ts are derived from these.
 */

/** A short is closed when the score falls below this. Also the top of the "Low" band. */
export const SHORT_EXIT = 5

/** A bank goes on watch at or above this. "Elevated or above" everywhere means score >= WATCH. */
export const WATCH = 8

/** A short entry is signalled at or above this. */
export const SHORT_ENTRY = 15

/** Start of the "Critical" band. Score chart axes never top out below this. */
export const SEVERE = 25

/** A one-day jump of this many points is a spike signal on its own. */
export const SCORE_SPIKE = 5
