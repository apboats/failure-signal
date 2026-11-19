import { Select, Skeleton } from '@/components/ui'
import type { DataWindow } from '@/domain/analytics/series'
import {
  describeDataWindow,
  isRangeKey,
  RANGE_OPTIONS,
  type RangeKey,
} from './range'

export interface DataWindowBarProps {
  range: RangeKey
  onRangeChange: (range: RangeKey) => void
  /** null while the rows are loading. */
  dataWindow: DataWindow | null
}

/** PageHeader right slot: the measured window line and the range Select. */
export function DataWindowBar({
  range,
  onRangeChange,
  dataWindow,
}: DataWindowBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-xs text-muted tabular-nums" aria-live="polite">
        {dataWindow ? (
          describeDataWindow(dataWindow)
        ) : (
          <Skeleton inline className="h-4 w-64" />
        )}
      </p>
      <span className="flex items-center gap-2">
        <label
          htmlFor="validation-range"
          className="text-xs font-medium text-muted"
        >
          Range
        </label>
        <Select
          id="validation-range"
          value={range}
          onChange={(event) => {
            const next = event.target.value
            if (isRangeKey(next)) onRangeChange(next)
          }}
          className="max-w-32"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </span>
    </div>
  )
}
