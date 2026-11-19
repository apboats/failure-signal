import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { QueryError } from '@/lib/fetchAll'

/** A 4xx from PostgREST (bad key, RLS, missing column) will not fix itself; only retry transient failures. */
function shouldRetry(failureCount: number, error: Error): boolean {
  if (
    error instanceof QueryError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500
  )
    return false
  return failureCount < 2
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

/** App-wide providers. The QueryClient is created once per mounted tree. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
