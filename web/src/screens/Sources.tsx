import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSources, triggerFetch } from '../api/sources'
import SourceCard from '../components/SourceCard'

export default function Sources() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: getSources,
    refetchInterval: 60000,
  })

  const handleFetch = async (id: string) => {
    await triggerFetch(id)
    queryClient.invalidateQueries({ queryKey: ['sources'] })
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h2 className="font-sans text-3xl font-bold text-glass-text mb-2">📡 来源看板</h2>
        <p className="text-sm text-glass-muted font-sans">管理数据源状态与抓取</p>
      </div>

      {isLoading && (
        <div className="font-sans text-sm text-glass-muted">加载中...</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {data?.sources?.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            onFetch={handleFetch}
          />
        ))}
      </div>

      {!isLoading && (!data?.sources || data.sources.length === 0) && (
        <div className="py-20 text-center font-sans text-sm text-glass-muted">
          😿 暂无来源
        </div>
      )}
    </div>
  )
}
