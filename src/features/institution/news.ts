/**
 * The analysis step stores its own failure text in `summary` (e.g.
 * "[Analysis failed: Error: 404 …]"); that is pipeline state, not an article
 * summary, so the row shows nothing instead of the raw error.
 */
const PIPELINE_ERROR = /^\s*\[analysis failed/i

export function displaySummary(
  summary: string | null | undefined,
): string | null {
  if (!summary) return null
  const text = summary.trim()
  return text && !PIPELINE_ERROR.test(text) ? text : null
}
