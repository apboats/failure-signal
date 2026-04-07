import { useLocation } from 'react-router-dom'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/alerts': 'Alert Configuration',
  '/history': 'Historical Analysis',
}

export function Header() {
  const location = useLocation()
  const title = titles[location.pathname] ?? 'Institution Detail'

  return (
    <header className="flex items-center justify-between border-b border-slate-700 bg-slate-900/50 px-6 py-4">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>
    </header>
  )
}
