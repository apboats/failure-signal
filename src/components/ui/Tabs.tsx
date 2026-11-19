import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { formatCount } from '@/lib/format'
import { cx } from './cx'
import { nextTabIndex } from './tabNav'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  count?: number | null
}

export interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  'aria-label'?: string
  className?: string
}

const tabId = (id: string) => `tab-${id}`
const panelId = (id: string) => `tabpanel-${id}`

/**
 * Underline tabs under a PageHeader. Arrow keys move between tabs; pair with
 * useTabParam so `?tab=` keeps the tab on reload, and wrap each panel in
 * <TabPanel id>.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel = 'Sections',
  className,
}: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(event.key, index, tabs.length)
    if (next === null) return
    event.preventDefault()
    const tab = tabs[next]
    onChange(tab.id)
    buttons.current.get(tab.id)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('flex gap-4 border-b border-border', className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttons.current.set(tab.id, el)
              else buttons.current.delete(tab.id)
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={selected}
            aria-controls={panelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              'focus-ring -mb-px inline-flex items-center gap-2 border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== null ? (
              <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted tabular-nums">
                {formatCount(tab.count)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** The content region of a tab; its id links it to the tab button. */
export function TabPanel({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(id)}
      aria-labelledby={tabId(id)}
      className={cx('space-y-6', className)}
    >
      {children}
    </div>
  )
}
