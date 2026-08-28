import { useQuery } from '@tanstack/react-query'
import { get } from '../../api/client'

const categoryIcons: Record<string, string> = {
  '开发工具': '🛠️',
  '论文研究': '📄',
  '行业动态': '📰',
  '模型发布': '🚀',
  '教程指南': '📚',
  '观点评论': '💭',
  '其他': '📌',
}

type Props = {
  selectedCategory: string
  onCategoryChange: (category: string) => void
}

export default function CategoryFilter({ selectedCategory, onCategoryChange }: Props) {
  const { data } = useQuery({
    queryKey: ['category-stats'],
    queryFn: () => get<{ categories: { category: string; count: number }[] }>('/stats'),
    staleTime: 60000,
  })

  const categories = data?.categories?.filter(c => c.category && c.count > 0) ?? []

  return (
    <div className="rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md">
      <h3 className="font-sans text-sm font-bold text-glass-text mb-4">分类筛选</h3>
      
      <div className="space-y-1">
        <button
          onClick={() => onCategoryChange('')}
          className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 font-sans text-sm font-semibold transition-all ${
            selectedCategory === ''
              ? 'bg-green-100 text-green-800'
              : 'text-glass-muted hover:bg-white/50 hover:text-glass-text'
          }`}
        >
          <span className="flex items-center gap-2">
            <span>📊</span>
            <span>全部</span>
          </span>
        </button>

        {categories.map((cat) => {
          const icon = categoryIcons[cat.category] || '📌'
          return (
            <button
              key={cat.category}
              onClick={() => onCategoryChange(selectedCategory === cat.category ? '' : cat.category)}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 font-sans text-sm font-semibold transition-all ${
                selectedCategory === cat.category
                  ? 'bg-green-100 text-green-800'
                  : 'text-glass-muted hover:bg-white/50 hover:text-glass-text'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{icon}</span>
                <span>{cat.category}</span>
              </span>
              <span className="text-xs text-glass-muted">{cat.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
