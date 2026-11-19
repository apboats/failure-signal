/** 'investment_banking' -> 'Investment banking' for the sector Badge and description. */
export function formatSector(sector: string): string {
  const text = sector.replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : sector
}
