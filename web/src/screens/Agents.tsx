const agents = [
  {
    id: '1',
    name: '研究分析师',
    description: '深度研究与分析专家',
    icon: '🔍',
    color: 'bg-purple-100 text-purple-700',
    detail: '能够对复杂课题进行多维度深入研究，生成结构化的分析报告，帮助用户快速把握行业动态与技术趋势。',
  },
  {
    id: '2',
    name: '趋势观察者',
    description: '实时追踪热点趋势',
    icon: '📈',
    color: 'bg-orange-100 text-orange-700',
    detail: '7×24 小时监控全网 AI/Agent 领域动态，自动识别突发热点，第一时间推送关键信息。',
  },
  {
    id: '3',
    name: '数据分析师',
    description: '数据挖掘与可视化',
    icon: '📊',
    color: 'bg-green-100 text-green-700',
    detail: '擅长从海量数据中提取有价值的信息，生成直观的可视化图表，辅助决策分析。',
  },
]

export default function Agents() {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h2 className="font-sans text-3xl font-bold text-glass-text mb-2">🤖 智能体工作台</h2>
        <p className="text-sm text-glass-muted font-sans">选择智能体，开启你的 AI 助手</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex flex-col rounded-2xl border border-glass-border bg-glass-surface p-6 shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-xl"
          >
            <div className="flex items-center gap-4 mb-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${agent.color}`}
              >
                {agent.icon}
              </div>
              <div>
                <div className="font-sans text-lg font-bold text-glass-text">{agent.name}</div>
                <div className="font-sans text-xs text-glass-muted">{agent.description}</div>
              </div>
            </div>
            <p className="flex-1 font-sans text-sm text-glass-muted leading-relaxed mb-5">
              {agent.detail}
            </p>
            <button
              onClick={() => alert('即将上线：智能体对话功能')}
              className="w-full cursor-pointer rounded-xl border-2 border-green-200 bg-green-50 px-5 py-2.5 font-sans text-sm font-bold text-green-700 shadow-md backdrop-blur-md transition-all hover:bg-green-100 hover:shadow-lg"
            >
              使用
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
