import type { Item } from '../api/types'

type Props = {
  item: Item
  index: number
}

export default function ItemCard({ item, index }: Props) {
  const domain = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : ''

  return (
    <div
      className="animate-fade-in-up rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-xl cursor-pointer"
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={() => item.url && window.open(item.url, '_blank')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-sans font-semibold text-green-700">
              {item.sourceName}
            </span>
            {item.category && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-yellow-700">
                {item.category}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-glass-text leading-snug mb-2 line-clamp-2">
            {item.title}
          </h3>
          {item.summaryZh && (
            <p className="text-xs text-glass-muted leading-relaxed line-clamp-2">
              {item.summaryZh}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] font-sans text-glass-muted">
        <div className="flex items-center gap-3">
          {item.relevance !== null && (
            <span className="font-semibold text-green-600">相关度:{item.relevance}</span>
          )}
          {item.heat !== null && (
            <span className="font-semibold text-purple-600">热度:{item.heat.toFixed(3)}</span>
          )}
          {domain && <span className="truncate max-w-[100px]">{domain}</span>}
        </div>
        {item.publishedAt && (
          <span>{new Date(item.publishedAt).toLocaleDateString('zh-CN')}</span>
        )}
      </div>
    </div>
  )
}
