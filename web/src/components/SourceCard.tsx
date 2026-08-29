import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceStatus } from '../api/types'
import { getSourceFetchStatus } from '../api/sources'

type Props = {
  source: SourceStatus
  onFetch: (id: string) => Promise<void>
}

type FetchResult = 'success' | 'error' | null

export default function SourceCard({ source, onFetch }: Props) {
  const queryClient = useQueryClient()
  const tierColor =
    source.tier === 'A'
      ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
      : source.tier === 'B'
        ? 'bg-purple-100 text-purple-700 border-purple-200'
        : 'bg-gray-100 text-gray-600 border-gray-200'

  const [result, setResult] = useState<FetchResult>(null)
  const [localRunning, setLocalRunning] = useState(source.fetchStatus === 'running')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLocalRunning(source.fetchStatus === 'running')
  }, [source.fetchStatus])

  useEffect(() => {
    if (!localRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(async () => {
      try {
        const { fetchStatus } = await getSourceFetchStatus(source.id)
        if (fetchStatus === 'idle') {
          setLocalRunning(false)
          queryClient.invalidateQueries({ queryKey: ['sources'] })
        }
      } catch {
        // ignore poll errors
      }
    }, 2000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [localRunning, source.id, queryClient])

  const handleFetch = async () => {
    setResult(null)
    try {
      await onFetch(source.id)
      setResult('success')
    } catch {
      setResult('error')
    } finally {
      setTimeout(() => setResult(null), 2000)
    }
  }

  const isRunning = localRunning
  const buttonDisabled = !source.enabled || isRunning

  const buttonClass = result === 'success'
    ? 'border-green-400 bg-green-100 text-green-800'
    : result === 'error'
      ? 'border-red-400 bg-red-100 text-red-800'
      : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:shadow-lg'

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
      </div>

      <button
        onClick={handleFetch}
        disabled={buttonDisabled}
        className={`mt-4 w-full cursor-pointer rounded-xl border-2 px-3 py-2 font-sans text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${buttonClass}`}
      >
        {isRunning ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span>抓取中...</span>
          </>
        ) : result === 'success' ? (
          <span>✓ 抓取成功</span>
        ) : result === 'error' ? (
          <span>✗ 抓取失败</span>
        ) : (
          <span>✨ 手动抓取</span>
        )}
      </button>
    </div>
  )
}
