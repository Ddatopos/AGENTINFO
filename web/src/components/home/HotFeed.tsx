import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { get } from '../../api/client'
import type { Item } from '../../api/types'

type Props = {
  categoryFilter: string
  searchQuery: string
}

const PAGE_SIZE = 5
const rankColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-400 text-white',
  3: 'bg-orange-400 text-white',
}

export default function HotFeed({ categoryFilter, searchQuery }: Props) {
  const [page, setPage] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(200)
  const navigate = useNavigate()

  const buildQuery = (limit: number) => {
    const params = new URLSearchParams()
    params.set('sort', 'heat')
    params.set('limit', String(limit))
    params.set('minScore', '50') // 只显示相关性 >= 50 的数据
    if (categoryFilter) params.set('category', categoryFilter)
    if (searchQuery) params.set('q', searchQuery)
    return `/items?${params.toString()}`
  }

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'hot', categoryFilter, searchQuery, showAll],
    queryFn: () => get<{ items: Item[]; total: number }>(buildQuery(showAll ? 200 : 20)),
    staleTime: 0,
  })

  const loadMore = () => {
    setShowAll(true)
    setPage(1)
  }

  const todayItems = useMemo(() => {
    if (!data?.items) return []
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return data.items.filter((item) => (item.publishedAt ?? 0) >= startOfDay)
  }, [data])

  const allItems = useMemo(() => {
    if (searchQuery) return data?.items ?? []
    if (showAll) return data?.items ?? []
    return todayItems.length > 0 ? todayItems : data?.items ?? []
  }, [searchQuery, showAll, todayItems, data])

  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = allItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const goPrev = () => setPage((p) => Math.max(1, p - 1))
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1))
  const toggleShowAll = () => {
    setShowAll((v) => !v)
    setPage(1)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-sans text-lg font-bold text-glass-text">
            {searchQuery ? `搜索: "${searchQuery}"` : showAll ? '热门排行' : '今日热点'}
          </h3>
          {!showAll && !searchQuery && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
            </span>
          )}
          <span className="text-[10px] font-sans text-glass-muted">
            {showAll && !searchQuery ? `共 ${allItems.length} 条` : !searchQuery ? '实时更新' : ''}
          </span>
        </div>
        {!searchQuery && (
          <div className="flex items-center gap-3">
            {data?.total && (
              <span className="font-sans text-xs text-glass-muted">
                共 {data.total} 条 {showAll && allItems.length < data.total && `(已加载 ${allItems.length} 条)`}
              </span>
            )}
            <button
              onClick={toggleShowAll}
              className="font-sans text-xs font-semibold text-green-600 hover:text-green-700"
            >
              {showAll ? '← 返回今日' : '查看全部 →'}
            </button>
          </div>
        )}
        {searchQuery && (
          <button
            onClick={() => navigate('/home')}
            className="font-sans text-xs font-semibold text-purple-600 hover:text-purple-700"
          >
            ✕ 清除搜索
          </button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="py-10 text-center font-sans text-sm text-glass-muted">加载中…</div>
        )}
        {!isLoading && allItems.length === 0 && (
          <div className="py-10 text-center font-sans text-sm text-glass-muted">暂无数据</div>
        )}
        {pageItems.map((item, idx) => {
          const rank = (safePage - 1) * PAGE_SIZE + idx + 1
          const domain = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : ''
          const timeAgo = item.publishedAt
            ? formatTimeAgo(item.publishedAt)
            : ''
          const rankClass = rankColors[rank] || 'bg-gray-200 text-gray-600'

          return (
            <div
              key={item.id}
              onClick={() => item.url && window.open(item.url, '_blank')}
              className="group flex items-start gap-3 rounded-2xl border border-glass-border bg-glass-surface p-4 shadow-md backdrop-blur-md transition-all hover:scale-[1.01] hover:shadow-xl cursor-pointer"
            >
              <div
                className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankClass}`}
              >
                {rank}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-glass-text leading-snug line-clamp-2 group-hover:text-green-700 transition-colors">
                  {item.title}
                </h4>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-green-700">
                    {item.sourceName}
                  </span>
                  {item.category && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-yellow-700">
                      {item.category}
                    </span>
                  )}
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-purple-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] font-sans text-glass-muted">
                  {domain && <span className="truncate max-w-[120px]">{domain}</span>}
                  <span className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {(item.metrics?.views ?? 0).toLocaleString()}
                  </span>
                  <span>{timeAgo}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={goPrev}
            disabled={safePage === 1}
            className="cursor-pointer rounded-xl border-2 border-glass-border bg-glass-surface px-5 py-2.5 font-sans text-sm font-bold text-glass-muted shadow-md backdrop-blur-md transition-all hover:scale-110 hover:text-green-600 hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← 上一页
          </button>
          <span className="font-sans text-sm font-bold text-glass-muted bg-white/50 px-4 py-2 rounded-xl border border-glass-border">
            第 {safePage} / {totalPages} 页
          </span>
          <button
            onClick={goNext}
            disabled={safePage === totalPages}
            className="cursor-pointer rounded-xl border-2 border-glass-border bg-glass-surface px-5 py-2.5 font-sans text-sm font-bold text-glass-muted shadow-md backdrop-blur-md transition-all hover:scale-110 hover:text-green-600 hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}
