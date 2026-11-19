import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export interface PageHeaderProps {
  title: string
  /** One line of meta text under the title. */
  description?: ReactNode
  /** Freshness pill, search input and/or the primary Button. */
  right?: ReactNode
  /**
   * true renders a Back icon button that goes to the previous history entry, or
   * to '/' when this page was the entry point. A function runs instead.
   */
  back?: boolean | (() => void)
}

const BACK_CLASS =
  'focus-ring -ml-1 mt-0.5 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text'

function HistoryBackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <button
      type="button"
      aria-label="Back"
      className={BACK_CLASS}
      onClick={() => {
        if (location.key !== 'default') navigate(-1)
        else navigate('/')
      }}
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
    </button>
  )
}

/** Page title row: h1, description, right slot. Also sets the document title (React 19 hoists <title>). */
export function PageHeader({
  title,
  description,
  right,
  back,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <title>{`${title} · Failure Signal`}</title>
      <div className="flex min-w-0 items-start gap-2">
        {back === true ? (
          <HistoryBackButton />
        ) : typeof back === 'function' ? (
          <button
            type="button"
            aria-label="Back"
            className={BACK_CLASS}
            onClick={back}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {right ? (
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      ) : null}
    </header>
  )
}
