import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../api/client'
import type { BriefingMeta, BriefingDetail } from '../api/types'
import ReactMarkdown from 'react-markdown'

export default function Briefings() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [selected, setSelected] = useState<BriefingDetail | null>(null)

  const { data: listData, isLoading } = useQuery({
    queryKey: ['briefings'],
    queryFn: () => get<{ briefings: BriefingMeta[] }>('/briefings'),
    refetchInterval: 60000,
  })

  const generateMutation = useMutation({
    mutationFn: (p: 'daily' | 'weekly') => post<BriefingDetail>('/briefings/generate', { period: p }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefings'] })
    },
  })

  const filtered = listData?.briefings?.filter((b) => b.period === period) ?? []

  const handleSelect = async (key: string) => {
    const data = await get<BriefingDetail>(`/briefings/${period}/${key}`)
    setSelected(data)
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="font-sans text-3xl font-bold text-glass-text mb-2">📋 简报</h2>
          <p className="text-sm text-glass-muted font-sans">日报 / 周报自动生成</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => generateMutation.mutate('daily')}
            disabled={generateMutation.isPending}
            className="cursor-pointer rounded-xl border-2 border-green-200 bg-green-50 px-5 py-2 font-sans text-sm font-bold text-green-700 shadow-md backdrop-blur-md transition-all hover:bg-green-100 hover:shadow-lg disabled:opacity-50"
          >
            {generateMutation.isPending ? '生成中...' : '✨ 生成日报'}
          </button>
          <button
            onClick={() => generateMutation.mutate('weekly')}
            disabled={generateMutation.isPending}
            className="cursor-pointer rounded-xl border-2 border-cyan-200 bg-cyan-50 px-5 py-2 font-sans text-sm font-bold text-cyan-700 shadow-md backdrop-blur-md transition-all hover:bg-cyan-100 hover:shadow-lg disabled:opacity-50"
          >
            {generateMutation.isPending ? '生成中...' : '✨ 生成周报'}
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-6 border-b-2 border-glass-border">
        <button
          onClick={() => { setPeriod('daily')
            setSelected(null) }}
          className={`pb-3 font-sans text-sm font-bold transition-colors ${
            period === 'daily'
              ? 'border-b-2 border-green-400 text-green-700'
              : 'text-glass-muted hover:text-glass-text'
          }`}
        >
          📅 日报
        </button>
        <button
          onClick={() => { setPeriod('weekly')
            setSelected(null) }}
          className={`pb-3 font-sans text-sm font-bold transition-colors ${
            period === 'weekly'
              ? 'border-b-2 border-cyan-400 text-cyan-700'
              : 'text-glass-muted hover:text-glass-text'
          }`}
        >
          📅 周报
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {isLoading && <div className="font-sans text-sm text-glass-muted">加载中...</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="font-sans text-sm text-glass-muted">暂无简报</div>
          )}
          {filtered.map((b) => (
            <div
              key={b.id}
              onClick={() => handleSelect(b.periodKey)}
              className={`cursor-pointer rounded-2xl border border-glass-border bg-glass-surface p-5 shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-xl ${
                selected?.periodKey === b.periodKey
                  ? 'border-green-300 bg-white/70 shadow-xl'
                  : ''
              }`}
            >
              <div className="font-sans text-sm font-bold text-glass-text">
                {period === 'daily' ? '日报' : '周报'} {b.periodKey}
              </div>
              <div className="mt-1 text-[10px] font-sans text-glass-muted">
                {new Date(b.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="rounded-2xl border border-glass-border bg-glass-surface p-6 shadow-lg backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-sans text-lg font-bold text-glass-text">
                  {selected.period === 'daily' ? '日报' : '周报'} {selected.periodKey}
                </h3>
                <span className="text-[10px] font-sans text-glass-muted">
                  {new Date(selected.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="prose prose-slate max-w-none font-sans text-sm leading-relaxed text-glass-text">
                <ReactMarkdown>{selected.markdown}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center font-sans text-sm text-glass-muted rounded-2xl border border-glass-border bg-glass-surface">
              选择左侧简报查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
