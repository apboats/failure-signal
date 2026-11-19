/**
 * Roving-tabindex keyboard model for a horizontal tablist (WAI-ARIA tabs):
 * Left/Right wrap, Home/End jump. Returns null for any other key.
 */
export function nextTabIndex(
  key: string,
  index: number,
  length: number,
): number | null {
  if (length === 0) return null
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % length
    case 'ArrowLeft':
      return (index - 1 + length) % length
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
