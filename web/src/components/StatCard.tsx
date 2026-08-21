type Props = {
  label: string
  value: string | number
  sub?: string
  icon?: string
  span?: number
}

export default function StatCard({ label, value, sub, icon, span = 1 }: Props) {
  return (
    <div
      className="animate-fade-in-up rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:shadow-xl"
      style={{ gridColumn: `span ${span}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-sans font-semibold text-glass-muted uppercase tracking-wider">
          {label}
        </span>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <div className="mt-2 font-sans text-3xl font-bold text-glass-text">{value}</div>
      {sub && <div className="mt-1 text-xs text-glass-muted">{sub}</div>}
    </div>
  )
}
