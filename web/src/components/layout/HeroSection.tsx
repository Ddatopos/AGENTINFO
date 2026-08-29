import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const recommendedTags = [
  'AI Agent 技术趋势',
  'OpenAI 最新动态',
  '大模型微调教程',
  'RAG 检索增强生成',
]

export default function HeroSection() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQuery)
  const navigate = useNavigate()

  useEffect(() => {
    const currentQuery = searchParams.get('q') ?? ''
    setQuery(currentQuery)
  }, [searchParams])

  const handleSearch = () => {
    const trimmed = query.trim()
    if (!trimmed) {
      navigate('/home')
      return
    }
    navigate(`/home?q=${encodeURIComponent(trimmed)}`)
  }

  const handleTagClick = (tag: string) => {
    setQuery(tag)
    navigate(`/home?q=${encodeURIComponent(tag)}`)
  }

  const handleClear = () => {
    setQuery('')
    navigate('/home')
  }

  return (
    <div className="relative overflow-hidden pt-12 pb-10">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="font-sans text-5xl font-bold bg-gradient-to-r from-green-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent mb-3">
          AI 驱动的全球情报搜索
        </h1>
        <p className="text-sm text-glass-muted font-sans mb-8">
          聚合全网优质信息，AI 智能分析总结，帮助你一步洞察世界
        </p>

        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入关键词、问题或主题，AI Agent 帮你搜索全网…"
              className="w-full rounded-2xl border-2 border-glass-border bg-white/70 px-5 py-3.5 pr-12 font-sans text-sm text-glass-text shadow-lg backdrop-blur-md outline-none transition-all focus:border-green-400 focus:shadow-xl"
            />
            {query && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="shrink-0 rounded-2xl bg-purple-600 px-5 py-3.5 font-sans text-sm font-bold text-white shadow-lg hover:bg-purple-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-glass-muted font-sans">推荐搜索：</span>
          {recommendedTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className="rounded-full border border-glass-border bg-white/60 px-3 py-1 font-sans text-xs font-semibold text-glass-muted hover:border-green-300 hover:text-green-700 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
