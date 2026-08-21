import { useState } from 'react'

type Props = {
  onFilterChange: (filters: {
    source?: string
    category?: string
    q?: string
    sort?: string
    limit?: number
  }) => void
  categories: string[]
}

export default function FilterBar({ onFilterChange, categories }: Props) {
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('heat')
  const [limit, setLimit] = useState(6)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFilterChange({
      source: source || undefined,
      category: category || undefined,
      q: q || undefined,
      sort,
      limit,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in-up rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1.5 block text-[10px] font-sans font-bold text-glass-muted uppercase tracking-wider">
            🔍 搜索
          </label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词..."
            className="w-full rounded-xl border border-glass-border bg-white/60 px-4 py-2 font-sans text-sm text-glass-text placeholder-glass-muted outline-none transition-all focus:border-green-300 focus:shadow-lg"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-sans font-bold text-glass-muted uppercase tracking-wider">
            来源
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="来源 ID"
            className="w-32 rounded-xl border border-glass-border bg-white/60 px-3 py-2 font-sans text-sm text-glass-text placeholder-glass-muted outline-none transition-all focus:border-green-300"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-sans font-bold text-glass-muted uppercase tracking-wider">
            分类
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-glass-border bg-white/60 px-3 py-2 font-sans text-sm text-glass-text outline-none transition-all focus:border-green-300"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-sans font-bold text-glass-muted uppercase tracking-wider">
            排序
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-glass-border bg-white/60 px-3 py-2 font-sans text-sm text-glass-text outline-none transition-all focus:border-green-300"
          >
            <option value="heat">热度</option>
            <option value="time">时间</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-sans font-bold text-glass-muted uppercase tracking-wider">
            每页条数
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-xl border border-glass-border bg-white/60 px-3 py-2 font-sans text-sm text-glass-text outline-none transition-all focus:border-green-300"
          >
            <option value="6">6</option>
            <option value="12">12</option>
            <option value="24">24</option>
          </select>
        </div>

        <button
          type="submit"
          className="cursor-pointer rounded-xl border-2 border-green-200 bg-green-50 px-5 py-2 font-sans text-sm font-bold text-green-700 transition-all hover:bg-green-100 hover:shadow-lg"
        >
          筛选
        </button>
      </div>
    </form>
  )
}
