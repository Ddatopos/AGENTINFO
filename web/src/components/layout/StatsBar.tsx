import { useQuery } from '@tanstack/react-query'
import StatCard from '../StatCard'
import type { Stats } from '../../api/types'
import { get } from '../../api/client'

export default function StatsBar() {
  const { data } = useQuery({
    queryKey: ['stats'],
    queryFn: () => get<Stats>('/stats'),
    refetchInterval: 30000,
  })

  const stats = [
    {
      label: '索引网页',
      value: data?.items ? data.items.toLocaleString() : '--',
      sub: '实时更新',
      icon: '🌐',
    },
    {
      label: '活跃数据源',
      value: data?.activeSources ?? '--',
      sub: '可信赖',
      icon: '📊',
    },
    {
      label: '相似度',
      value: data?.avgRelevance ? `${data.avgRelevance}%` : '--',
      sub: 'AI 精准匹配',
      icon: '🎯',
    },
  ]

  return (
    <div className="mx-auto max-w-6xl mb-10">
      <div className="grid grid-cols-3 gap-4">
        {stats.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  )
}
