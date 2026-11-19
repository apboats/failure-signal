import { Activity, X } from 'lucide-react'
import { Fragment, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { navRoutes } from '@/app/routes'
import { Badge, cx } from '@/components/ui'
import { useCandidates } from '@/queries/useReview'

export interface SidebarProps {
  /** True while the mobile drawer is open; focus moves to the close button. */
  drawerOpen: boolean
  onClose: () => void
}

const LINK =
  'focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'

/** Brand row plus the inNav routes from the route table, with a divider before the reference group. */
export function Sidebar({ drawerOpen, onClose }: SidebarProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const candidates = useCandidates()
  const pendingCount = (candidates.data ?? []).filter(
    (row) => row.review_status === 'pending',
  ).length

  useEffect(() => {
    if (drawerOpen) closeButton.current?.focus()
  }, [drawerOpen])

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
        <NavLink
          to="/"
          onClick={onClose}
          className="focus-ring flex items-center gap-2 rounded-lg"
        >
          <Activity aria-hidden="true" className="size-6 text-accent" />
          <span className="text-base font-semibold text-text">
            Failure Signal
          </span>
        </NavLink>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text md:hidden"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-3">
        {navRoutes.map((route, index) => {
          const Icon = route.icon
          const previous = navRoutes[index - 1]
          const startsGroup =
            previous !== undefined && previous.group !== route.group
          return (
            <Fragment key={route.path}>
              {startsGroup ? <hr className="my-3 border-border" /> : null}
              <NavLink
                to={route.path}
                end={route.path === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  cx(
                    LINK,
                    isActive
                      ? 'bg-surface-2 text-text'
                      : 'text-muted hover:bg-surface-2 hover:text-text',
                  )
                }
              >
                {Icon ? <Icon aria-hidden="true" className="size-5" /> : null}
                {route.label}
                {route.path === '/review' && pendingCount > 0 ? (
                  <Badge tone="sev-medium" size="sm" className="ml-auto">
                    <span className="sr-only">Pending: </span>
                    {pendingCount}
                  </Badge>
                ) : null}
              </NavLink>
            </Fragment>
          )
        })}
      </nav>
    </aside>
  )
}
