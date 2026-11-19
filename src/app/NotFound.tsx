import { useLocation } from 'react-router-dom'
import { PageHeader, PageState } from '@/components/ui'

/** The catch-all route: an unknown URL gets a real page instead of an empty main. */
export function NotFound() {
  const { pathname } = useLocation()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Not found"
        description="This address does not match any page."
      />
      <PageState
        kind="notFound"
        title="No page here"
        message={`${pathname} is not a route. The Watchlist lists every bank; each one links to its detail page.`}
        backTo="/"
        backLabel="Back to Watchlist"
      />
    </div>
  )
}
