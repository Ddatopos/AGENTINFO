import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get } from '../../api/client'
import type { Item } from '../../api/types'

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
const TIME_RANGES = [
  { label: '近 7 天', value: '7', days: 7 },
  { label: '近 30 天', value: '30', days: 30 },
  { label: '近 90 天', value: '90', days: 90 },
]

function DonutChart({ data }: { data: { category: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) return null

  const radius = 60
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const segments = data.map((d, i) => {
    const fraction = d.count / total
    const length = fraction * circumference
    const segment = {
      category: d.category,
      count: d.count,
      percent: Math.round(fraction * 100),
      color: COLORS[i % COLORS.length],
      offset,
      length,
    }
    offset += length
    return segment
  })

  const centerPercent = segments[0]?.percent ?? 0

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="24"
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              transform="rotate(-90 80 80)"
              className="transition-all duration-500"
            />
          ))}
          <text x="80" y="76" textAnchor="middle" className="fill-glass-text font-sans text-2xl font-bold">
            {centerPercent}%
          </text>
          <text x="80" y="96" textAnchor="middle" className="fill-glass-muted font-sans text-[10px]">
            AI 相关内容占比
          </text>
        </svg>
      </div>
    </div>
  )
}

export default function SearchInsights() {
  const [days, setDays] = useState(7)
  const { data, isLoading } = useQuery({
    queryKey: ['items', 'insights', days],
    queryFn: () => get<{ items: Item[] }>(`/items?sort=heat&days=${days}&limit=200`),
    staleTime: 0,
  })

  const categoryStats = useMemo(() => {
    if (!data?.items) return []
    const map = new Map<string, number>()
    for (const item of data.items) {
      const cat = item.category?.trim()
      if (!cat) continue
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    const sorted = Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)

    if (sorted.length <= 5) return sorted
    const top = sorted.slice(0, 4)
    const others = sorted.slice(4).reduce((s, d) => s + d.count, 0)
    return [...top, { category: '其他其他', count: others }]
  }, [data])

  const totalCount = useMemo(
    () => categoryStats.reduce((s, d) => s + d.count, 0),
    [categoryStats]
  )

  return (
    <div className="rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-sans text-lg font-bold text-glass-text">搜索洞察</h3>
        <select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-glass-border bg-white/70 px-2 py-1 font-sans text-xs text-glass-muted outline-none focus:border-green-400"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.value} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-10 text-center font-sans text-sm text-glass-muted">加载中…</div>
      ) : totalCount === 0 ? (
        <div className="py-10 text-center font-sans text-sm text-glass-muted">暂无数据</div>
      ) : (
        <>
          <DonutChart data={categoryStats} />

          <div className="mt-5 space-y-2.5">
            {categoryStats.map((cat, i) => {
              const percent = totalCount > 0 ? Math.round((cat.count / totalCount) * 100) : 0
              return (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="font-sans text-xs text-glass-muted">{cat.category}</span>
                  </div>
                  <span className="font-sans text-xs font-bold text-glass-text">{percent}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
