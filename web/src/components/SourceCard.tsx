import type { SourceStatus } from '../api/types'

type Props = {
  source: SourceStatus
  onFetch: (id: string) => void
}

export default function SourceCard({ source, onFetch }: Props) {
  const tierColor =
    source.tier === 'A'
      ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
      : source.tier === 'B'
        ? 'bg-purple-100 text-purple-700 border-purple-200'
        : 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="animate-fade-in-up rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-sans text-sm font-bold text-glass-text truncate">{source.name}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-sans font-bold ${tierColor}`}>
          {source.tier}
        </span>
      </div>

      <div className="space-y-2 text-xs font-sans text-glass-muted">
        <div className="flex justify-between">
          <span>类型</span>
          <span className="font-semibold text-glass-text">{source.kind}</span>
        </div>
        <div className="flex justify-between">
          <span>条目数</span>
          <span className="font-semibold text-glass-text">{source.itemCount}</span>
        </div>
        <div className="flex justify-between">
          <span>权威度</span>
          <span className="font-semibold text-glass-text">{(source.authority * 100).toFixed(0)}%</span>
        </div>
        {source.lastFetchAt && (
          <div className="flex justify-between">
            <span>上次抓取</span>
            <span className="font-semibold text-glass-text">
              {new Date(source.lastFetchAt).toLocaleString('zh-CN')}
            </span>
          </div>
        )}
        {source.failStreak > 0 && (
          <div className="flex justify-between text-red-500 font-semibold">
            <span>失败次数</span>
            <span>{source.failStreak}</span>
          </div>
        )}
        {source.lastError && (
          <div className="text-red-500 truncate text-[10px]" title={source.lastError}>
            {source.lastError}
          </div>
        )}
      </div>

      <button
        onClick={() => onFetch(source.id)}
        disabled={!source.enabled}
        className="mt-4 w-full cursor-pointer rounded-xl border-2 border-green-200 bg-green-50 px-3 py-2 font-sans text-xs font-bold text-green-700 transition-all hover:bg-green-100 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ✨ 手动抓取
      </button>
    </div>
  )
}
