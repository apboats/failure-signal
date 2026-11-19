import { Menu } from 'lucide-react'
import { matchRoutes, useLocation } from 'react-router-dom'
import { routes } from '@/app/routes'
import { FreshnessPill } from '@/features/watchlist/FreshnessPill'

export interface HeaderProps {
  /** True while the mobile drawer is open (drives aria-expanded). */
  menuOpen: boolean
  onMenuToggle: () => void
}

/**
 * Top bar: the current route's title from the single route table (plain text,
 * since each page's PageHeader owns the h1) and, on md+, the pipeline
 * freshness pill so a stalled scoring job is visible on every route.
 */
export function Header({ menuOpen, onMenuToggle }: HeaderProps) {
  const location = useLocation()
  const title =
    matchRoutes(routes, location)?.at(-1)?.route.title ?? 'Not found'

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text md:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <p className="truncate text-sm font-medium text-text">{title}</p>
      </div>
      <div className="hidden md:block">
        <FreshnessPill />
      </div>
    </header>
  )
}
