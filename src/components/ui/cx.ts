export type ClassValue = string | false | null | undefined

/** Join conditional class names; falsy entries are dropped. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
