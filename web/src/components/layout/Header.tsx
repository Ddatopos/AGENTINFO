import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

const navItems = [
  { to: '/home', label: '探索' },
  { to: '/agents', label: '智能体' },
  { to: '/sources', label: '数据源' },
  { to: '/', label: 'HOME', isWelcome: true },
]

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const resetWelcome = useAppStore((s) => s.resetWelcome)

  const handleWelcomeClick = () => {
    resetWelcome()
    navigate('/')
  }

  return (
    <header className="shrink-0 border-b border-glass-border bg-glass-surface/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3">
        <NavLink to="/home" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-2xl">🐱</span>
          <span className="font-sans text-xl font-bold bg-gradient-to-r from-green-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
            AGENTINFO
          </span>
        </NavLink>
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== '/home' && location.pathname.startsWith(item.to))
            if (item.isWelcome) {
              return (
                <button
                  key={item.to}
                  onClick={handleWelcomeClick}
                  className={`font-sans text-sm font-semibold transition-colors relative ${
                    isActive ? 'text-green-600' : 'text-glass-muted hover:text-glass-text'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  {isActive && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-green-500 rounded-full" />
                  )}
                </button>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`font-sans text-sm font-semibold transition-colors relative ${
                  isActive ? 'text-green-600' : 'text-glass-muted hover:text-glass-text'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-green-500 rounded-full" />
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
