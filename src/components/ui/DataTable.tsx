import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from 'lucide-react'
import {
  useId,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Skeleton } from './Skeleton'
import {
  sortRows,
  type SortDir,
  type SortState,
  type SortValue,
} from './sortRows'

export type { SortDir, SortState, SortValue } from './sortRows'

export type Breakpoint = 'sm' | 'md' | 'lg'
export type ColumnAlign = 'left' | 'right' | 'center'

export interface Column<T> {
  key: string
  header: ReactNode
  /** Plain-text name for the mobile label and sort menu; defaults to `header` when it is a string. */
  label?: string
  align?: ColumnAlign
  /** Right-aligned tabular numerals; first sort is descending. */
  numeric?: boolean
  /** Makes the header sortable. Return null/undefined for a missing value (sorted last). */
  sortValue?: (row: T) => SortValue
  /** Direction of the first click; default 'asc' ('desc' when numeric). */
  defaultDir?: SortDir
  render: (row: T) => ReactNode
  /** Hidden on viewports narrower than this breakpoint. */
  hideBelow?: Breakpoint
  /**
   * Below md the row collapses: the 'primary' column is the row headline
   * (and carries the row link), every other visible column becomes a
   * label/value pair. The first column is primary by default.
   */
  mobileRole?: 'primary' | 'secondary'
  /** Extra classes for both the header and body cells (e.g. 'w-24'). */
  className?: string
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /** Controlled sort; omit for internal state seeded by `defaultSort`. */
  sort?: SortState
  onSort?: (sort: SortState) => void
  defaultSort?: SortState
  /** Row link (rendered on the primary cell; the whole row is clickable). */
  rowTo?: (row: T) => string
  /** Row action (rendered as a button on the primary cell; Enter/Space work). */
  onRowClick?: (row: T) => void
  rowSelected?: (row: T) => boolean
  rowClassName?: (row: T) => string | undefined
  /** Shown instead of the table when `rows` is empty (an <EmptyState>). */
  emptyState: ReactNode
  /** Filters and counts, rendered above the header. */
  toolbar?: ReactNode
  /** Visually hidden <caption>. */
  caption?: string
  /** Render skeleton rows while the data loads. */
  loading?: boolean
  skeletonRows?: number
  /** A max-height class (e.g. 'max-h-[32rem]'): the table scrolls inside it and the header sticks there. */
  maxHeight?: string
  className?: string
}

const HIDE_BELOW: Record<Breakpoint, string> = {
  sm: 'max-sm:hidden',
  md: 'max-md:hidden',
  lg: 'max-lg:hidden',
}

const ROW_MOBILE =
  'max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-2 max-md:px-4 max-md:py-3'

function columnLabel<T>(column: Column<T>): string {
  if (column.label) return column.label
  return typeof column.header === 'string' ? column.header : column.key
}

function firstDir<T>(column: Column<T>): SortDir {
  return column.defaultDir ?? (column.numeric ? 'desc' : 'asc')
}

/**
 * Typed data table: sortable headers (<th aria-sort> wrapping a <button>),
 * sticky header, numeric right-align + tabular-nums, responsive column hiding
 * and a mobile collapse that keeps the primary column. Clickable rows render a
 * Link or button in the primary cell so Tab and Enter work.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  defaultSort,
  rowTo,
  onRowClick,
  rowSelected,
  rowClassName,
  emptyState,
  toolbar,
  caption,
  loading = false,
  skeletonRows = 5,
  maxHeight,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | undefined>(
    defaultSort,
  )
  const controlled = sort !== undefined
  const activeSort = controlled ? sort : internalSort
  const sortColumn = activeSort
    ? columns.find((column) => column.key === activeSort.key)
    : undefined
  const sortValue = sortColumn?.sortValue
  const dir = activeSort?.dir ?? 'asc'
  const sorted = useMemo(
    () => sortRows(rows, sortValue, dir),
    [rows, sortValue, dir],
  )
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.mobileRole === 'primary'),
  )
  const sortable = columns.filter((column) => column.sortValue)
  const interactive = Boolean(rowTo || onRowClick)
  const mobileSortId = useId()

  function setSort(next: SortState) {
    if (!controlled) setInternalSort(next)
    onSort?.(next)
  }

  function toggleSort(column: Column<T>) {
    if (activeSort?.key === column.key) {
      setSort({
        key: column.key,
        dir: activeSort.dir === 'asc' ? 'desc' : 'asc',
      })
    } else {
      setSort({ key: column.key, dir: firstDir(column) })
    }
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: T) {
    const target = event.target as Element
    // A control inside the row handles its own click (and the primary link/button already fired).
    if (target.closest('a, button, input, select, textarea, label')) return
    if (window.getSelection()?.toString()) return
    if (onRowClick) {
      onRowClick(row)
      return
    }
    event.currentTarget
      .querySelector<HTMLAnchorElement>('a[data-row-link]')
      ?.click()
  }

  function cellClass(
    column: Column<T>,
    index: number,
    header: boolean,
  ): string {
    const right = column.numeric || column.align === 'right'
    return cx(
      header
        ? 'px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase whitespace-nowrap shadow-[inset_0_-1px_0_0_var(--color-border)]'
        : 'px-3 py-2.5 align-middle text-sm text-text',
      right
        ? 'md:text-right'
        : column.align === 'center'
          ? 'md:text-center'
          : 'text-left',
      column.numeric && 'tabular-nums',
      column.hideBelow && HIDE_BELOW[column.hideBelow],
      !header &&
        (index === primaryIndex
          ? 'max-md:col-span-2 max-md:p-0'
          : 'max-md:flex max-md:flex-col max-md:items-start max-md:gap-0.5 max-md:p-0'),
      column.className,
    )
  }

  const showToolbar = Boolean(toolbar) || sortable.length > 0
  const empty = !loading && rows.length === 0

  return (
    <div className={className} aria-busy={loading || undefined}>
      {showToolbar ? (
        <div
          className={cx(
            'flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-5',
            !toolbar && 'md:hidden',
          )}
        >
          {toolbar}
          {sortable.length > 0 ? (
            <div className="ml-auto flex items-center gap-1 md:hidden">
              <label htmlFor={mobileSortId} className="text-xs text-muted">
                Sort
              </label>
              <select
                id={mobileSortId}
                value={activeSort?.key ?? ''}
                onChange={(event) => {
                  const column = columns.find(
                    (c) => c.key === event.target.value,
                  )
                  if (column)
                    setSort({ key: column.key, dir: firstDir(column) })
                }}
                className="focus-ring rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text"
              >
                {activeSort ? null : <option value="">Default</option>}
                {sortable.map((column) => (
                  <option key={column.key} value={column.key}>
                    {columnLabel(column)}
                  </option>
                ))}
              </select>
              {activeSort ? (
                <button
                  type="button"
                  aria-label={
                    activeSort.dir === 'asc'
                      ? 'Sort descending'
                      : 'Sort ascending'
                  }
                  onClick={() =>
                    setSort({
                      key: activeSort.key,
                      dir: activeSort.dir === 'asc' ? 'desc' : 'asc',
                    })
                  }
                  className="focus-ring rounded-lg p-1 text-muted hover:text-text"
                >
                  {activeSort.dir === 'asc' ? (
                    <ArrowUp aria-hidden="true" className="size-4" />
                  ) : (
                    <ArrowDown aria-hidden="true" className="size-4" />
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div>{emptyState}</div>
      ) : (
        <div className={cx(maxHeight && 'overflow-auto', maxHeight, 'md:px-2')}>
          <table className="w-full border-collapse max-md:block">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead className="sticky top-0 z-10 bg-surface max-md:hidden">
              <tr>
                {columns.map((column, index) => {
                  const isSortable = Boolean(column.sortValue)
                  const isActive = isSortable && activeSort?.key === column.key
                  const ariaSort = !isSortable
                    ? undefined
                    : isActive
                      ? activeSort?.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  const SortIcon = !isActive
                    ? ChevronsUpDown
                    : activeSort?.dir === 'asc'
                      ? ChevronUp
                      : ChevronDown
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={ariaSort}
                      className={cellClass(column, index, true)}
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className={cx(
                            'focus-ring inline-flex items-center gap-1 rounded tracking-wide uppercase transition-colors hover:text-text',
                            isActive && 'text-text',
                          )}
                        >
                          {column.header}
                          <SortIcon
                            aria-hidden="true"
                            className={cx(
                              'size-3.5',
                              !isActive && 'opacity-50',
                            )}
                          />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border max-md:block">
              {loading
                ? Array.from({ length: skeletonRows }, (_, i) => (
                    <tr key={`skeleton-${i}`} className={ROW_MOBILE}>
                      {columns.map((column, index) => (
                        <td
                          key={column.key}
                          className={cellClass(column, index, false)}
                        >
                          <Skeleton
                            className={
                              index === primaryIndex ? 'h-4 w-24' : 'h-4 w-12'
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map((row) => {
                    const selected = rowSelected?.(row) ?? false
                    return (
                      <tr
                        key={rowKey(row)}
                        onClick={
                          interactive
                            ? (event) => handleRowClick(event, row)
                            : undefined
                        }
                        className={cx(
                          ROW_MOBILE,
                          'transition-colors',
                          interactive && 'cursor-pointer hover:bg-surface-2',
                          selected && 'bg-surface-2',
                          rowClassName?.(row),
                        )}
                      >
                        {columns.map((column, index) => {
                          const isPrimary = index === primaryIndex
                          const content = column.render(row)
                          // A secondary cell with nothing to show (e.g. an
                          // action that does not apply to this row) would
                          // otherwise leave an orphan label in the mobile card.
                          const blank =
                            content === null ||
                            content === undefined ||
                            content === false
                          return (
                            <td
                              key={column.key}
                              className={cx(
                                cellClass(column, index, false),
                                !isPrimary && blank && 'max-md:hidden',
                              )}
                            >
                              {!isPrimary ? (
                                <span className="text-xs text-muted md:hidden">
                                  {columnLabel(column)}
                                </span>
                              ) : null}
                              {isPrimary && rowTo ? (
                                <Link
                                  to={rowTo(row)}
                                  data-row-link=""
                                  aria-current={selected ? 'true' : undefined}
                                  className="focus-ring rounded font-medium text-text hover:underline"
                                >
                                  {content}
                                </Link>
                              ) : isPrimary && onRowClick ? (
                                <button
                                  type="button"
                                  aria-pressed={
                                    rowSelected ? selected : undefined
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onRowClick(row)
                                  }}
                                  className="focus-ring rounded text-left font-medium text-text"
                                >
                                  {content}
                                </button>
                              ) : (
                                content
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
