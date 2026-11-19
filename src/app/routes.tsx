import {
  Bell,
  BookOpen,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react'
import { lazy, type ComponentType, type ReactElement } from 'react'
import { Navigate, type NonIndexRouteObject } from 'react-router-dom'
import { NotFound } from './NotFound'

/** Sidebar group: 'reference' entries sit under a divider at the bottom. */
export type NavGroup = 'main' | 'reference'

/**
 * One row of the single route table. Structurally a react-router route
 * object, so the same array feeds useRoutes (App), matchRoutes (Header title)
 * and the Sidebar (the inNav subset); a page cannot drift between them.
 */
export type AppRoute = NonIndexRouteObject & {
  path: string
  element: ReactElement
  /** Shown in the app Header. The page's own PageHeader sets the document title. */
  title: string
  /** Sidebar label; only meaningful with inNav. */
  label?: string
  icon?: LucideIcon
  inNav?: boolean
  group?: NavGroup
}

/**
 * A lazily loaded page element. Pages are named exports, so `pick` remaps the
 * module to the `default` that React.lazy expects. Each call site keeps its own
 * literal import() so the bundler emits one chunk per route, and the lazy
 * wrapper is created once here at module load, never during render.
 */
function lazyPage<M>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType,
): ReactElement {
  const Page = lazy(() => load().then((m) => ({ default: pick(m) })))
  return <Page />
}

const pages: AppRoute[] = [
  {
    path: '/',
    title: 'Watchlist',
    label: 'Watchlist',
    icon: LayoutDashboard,
    inNav: true,
    group: 'main',
    element: lazyPage(
      () => import('@/pages/Dashboard'),
      (m) => m.Dashboard,
    ),
  },
  {
    path: '/institution/:id',
    title: 'Institution',
    element: lazyPage(
      () => import('@/pages/InstitutionDetail'),
      (m) => m.InstitutionDetail,
    ),
  },
  {
    path: '/trading',
    title: 'Trading',
    label: 'Trading',
    icon: TrendingDown,
    inNav: true,
    group: 'main',
    element: lazyPage(
      () => import('@/pages/Trading'),
      (m) => m.Trading,
    ),
  },
  {
    path: '/validation',
    title: 'Validation',
    label: 'Validation',
    icon: FlaskConical,
    inNav: true,
    group: 'main',
    element: lazyPage(
      () => import('@/pages/Validation'),
      (m) => m.Validation,
    ),
  },
  {
    path: '/alerts',
    title: 'Alerts',
    label: 'Alerts',
    icon: Bell,
    inNav: true,
    group: 'main',
    element: lazyPage(
      () => import('@/pages/Alerts'),
      (m) => m.Alerts,
    ),
  },
  {
    path: '/review',
    title: 'Review',
    label: 'Review',
    icon: ClipboardCheck,
    inNav: true,
    group: 'main',
    element: lazyPage(
      () => import('@/pages/Review'),
      (m) => m.Review,
    ),
  },
  {
    path: '/playbook',
    title: 'Playbook',
    label: 'Playbook',
    icon: BookOpen,
    inNav: true,
    group: 'reference',
    element: lazyPage(
      () => import('@/pages/Playbook'),
      (m) => m.Playbook,
    ),
  },
]

/** Pre-merge paths and where each one went. Rendered as <Navigate replace>. */
export const REDIRECTS: Readonly<Record<string, string>> = {
  '/signals': '/trading',
  '/portfolio': '/trading?tab=positions',
  '/backtest': '/validation',
  '/correlation': '/validation?tab=leadlag',
  '/history': '/playbook',
}

/** Title of the redirect target, so the frame before Navigate runs never reads "Not found". */
function titleOf(to: string): string {
  const pathname = to.split('?')[0]
  return pages.find((route) => route.path === pathname)?.title ?? 'Not found'
}

const redirects: AppRoute[] = Object.entries(REDIRECTS).map(([from, to]) => ({
  path: from,
  title: titleOf(to),
  element: <Navigate to={to} replace />,
}))

export const routes: AppRoute[] = [
  ...pages,
  ...redirects,
  { path: '*', title: 'Not found', element: <NotFound /> },
]

/** Sidebar entries in display order; a group change marks the divider. */
export const navRoutes: AppRoute[] = routes.filter((route) => route.inNav)
