import { Suspense } from 'react'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import { routes } from '@/app/routes'
import { AppShell } from '@/components/layout/AppShell'
import { PageState } from '@/components/ui'

/** useRoutes reads the Router context, so the table mounts one level below BrowserRouter. */
function AppRoutes() {
  return useRoutes(routes)
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<PageState kind="loading" skeleton="card" />}>
          <AppRoutes />
        </Suspense>
      </AppShell>
    </BrowserRouter>
  )
}
