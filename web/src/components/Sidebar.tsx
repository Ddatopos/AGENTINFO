import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  const navItems = [
    { to: '/home', label: '首页', icon: '🏠' },
    { to: '/briefings', label: '简报', icon: '📋' },
    { to: '/sources', label: '来源', icon: '📡' },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 border-r border-glass-border bg-glass-surface backdrop-blur-md z-40 p-4">
      <div className="flex h-full flex-col">
        <div className="mb-8">
          <h1 className="font-sans text-xl font-bold text-glass-text">
            🐾 AGENTINFO
          </h1>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white/60 text-glass-text shadow-md border border-white/50'
                    : 'text-glass-muted hover:text-glass-text hover:bg-white/40'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-glass-border">
          <div className="text-xs text-glass-muted font-sans text-center">
            全球 AI 情报聚合平台
          </div>
        </div>
      </div>
    </aside>
  )
}
