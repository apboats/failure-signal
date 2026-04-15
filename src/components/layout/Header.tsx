import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/signals': 'Trading Signals',
  '/portfolio': 'Portfolio',
  '/correlation': 'Score vs Price',
  '/alerts': 'Alerts',
  '/history': 'Case Studies',
}

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  const location = useLocation()
  const title = titles[location.pathname] ?? 'Institution Detail'

  return (
    <header className="flex items-center justify-between border-b border-slate-700 bg-slate-900/50 px-4 py-3 md:px-6 md:py-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-white md:text-xl">{title}</h1>
      </div>
      <span className="hidden text-sm text-slate-400 sm:block">
        {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </header>
  )
}
