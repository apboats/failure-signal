import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { cx } from '@/components/ui'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

/** Tailwind's md breakpoint (48rem): below it the sidebar is a drawer, above it a fixed column. */
const DESKTOP_QUERY = '(min-width: 48rem)'

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/**
 * Sidebar + header + scrolling main. Every page renders inside the same
 * max-w-7xl container, so the content width never jumps between routes.
 * On mobile the sidebar is a drawer: Escape or the scrim closes it, and while
 * closed it is inert so its links stay out of the tab order.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const close = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  const drawerVisible = drawerOpen && !desktop

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-text">
      {drawerVisible ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-bg/70 md:hidden"
          onClick={close}
        />
      ) : null}

      <div
        id="app-sidebar"
        inert={!desktop && !drawerOpen}
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-200 motion-reduce:transition-none md:relative md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar drawerOpen={drawerVisible} onClose={close} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          menuOpen={drawerVisible}
          onMenuToggle={() => setDrawerOpen((open) => !open)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
