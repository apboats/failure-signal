import { Badge, Skeleton } from '@/components/ui'
import type { Institution } from '@shared/types'

export interface BankCellProps {
  institution: Institution | undefined
  /** The institution index is still loading (renders a skeleton, not "Unknown"). */
  loading?: boolean
}

/**
 * Bank name + ticker for a table cell, resolved from the full institution
 * index so a deactivated bank keeps its name and gets an "Inactive" tag.
 */
export function BankCell({ institution, loading = false }: BankCellProps) {
  if (!institution) {
    if (loading) return <Skeleton inline className="h-4 w-32" />
    return <span className="text-muted">Bank not in index</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium text-text">{institution.name}</span>
      {institution.ticker ? (
        <span className="text-xs text-muted">{institution.ticker}</span>
      ) : null}
      {!institution.is_active ? (
        <Badge tone="neutral" size="sm">
          Inactive
        </Badge>
      ) : null}
    </span>
  )
}
