import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort boundary around the whole app: a thrown render error (or a chunk
 * that failed to load) shows its message and a Reload button instead of a blank
 * page. Deliberately free of ui-kit imports so it still renders when those fail.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen items-start justify-center bg-bg p-4 text-text md:p-6">
        <div
          role="alert"
          className="mt-16 w-full max-w-lg rounded-xl border border-border bg-surface p-4 md:p-5"
        >
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            The page hit an error it could not recover from. Reloading usually
            fixes a stale build or a dropped connection.
          </p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
