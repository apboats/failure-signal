import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bell, History, Activity, X, TrendingDown, Wallet } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/signals', icon: TrendingDown, label: 'Trading Signals' },
  { to: '/portfolio', icon: Wallet, label: 'Portfolio' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/history', icon: History, label: 'Case Studies' },
]

export function Sidebar({ onClose }: { onClose: () => void }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-red-500" />
          <span className="text-lg font-bold text-white">Failure Signal</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white md:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
