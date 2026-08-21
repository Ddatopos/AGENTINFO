# agentInfo 项目规划

## 愿景

打造一个**实时更新的全球 AI/Agent 领域资讯平台**，聚合 RSS、GitHub、HN、HuggingFace 等多源信息，经过去重、智能加工、热度排序，为用户提供高质量的中文 AI 情报服务。

## 当前状态

- **后端**：已完成数据采集、处理流水线、REST API、调度器
- **前端**：空白，待从零搭建
- **数据**：需手动触发 fetch/enrich 初始化

## 技术栈（最终版）

| 层级 | 技术选型 |
|---|---|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI 样式 | Tailwind CSS（纯手写，不用组件库） |
| 状态管理 | Zustand（全局 UI 状态） + React Query（服务端状态） |
| 路由 | React Router v6 |
| Markdown | react-markdown |
| 后端框架 | Express 5 + better-sqlite3 |
| 调度 | node-cron |
| LLM | OpenAI 兼容 API |

## 开发环境

- **前端**：`http://localhost:5173`（Vite dev server）
- **后端**：`http://localhost:3100`（Express）
- **代理**：本地 HTTP 代理（HTTPS_PROXY）必填，否则无法访问 GitHub/HuggingFace
- **跨域**：Vite proxy → Express，开发环境无跨域问题

## 里程碑规划

### Phase 1：前端基础设施（第 1 天）
- [ ] Vite + React + TypeScript 项目初始化
- [ ] Tailwind CSS 配置
- [ ] React Router 路由结构（首页、简报、来源）
- [ ] Zustand store 搭建（sidebar、filter 等全局状态）
- [ ] React Query 配置（QueryClient、默认选项）
- [ ] API 层封装（统一 fetch 封装 + 类型定义）
- [ ] Vite proxy 配置

### Phase 2：核心页面（第 2-3 天）
- [ ] **首页**：统计卡片 + 筛选栏 + 条目列表 + 排序
- [ ] **简报页**：日报/周报列表 + Markdown 渲染 + 生成按钮
- [ ] **来源页**：源状态看板 + 手动抓取按钮
- [ ] 布局：侧边栏导航 + 主内容区 + 响应式

### Phase 3：体验优化（第 4 天）
- [ ] React Query 轮询（items 30s，briefings 60s）
- [ ] 加载/空/错误状态处理
- [ ] 移动端响应式
- [ ] 深色模式（可选）

### Phase 4：增强功能（后续迭代）
- [ ] 条目详情页
- [ ] 收藏/稍后读（localStorage 或后端表）
- [ ] 分类/标签筛选强化
- [ ] PWA 支持
- [ ] 用户系统（如需个性化）

## 前后端接口契约

### Items
```
GET /api/items?source=&category=&lang=&q=&sort=heat&minScore=&days=&limit=50&offset=0
Response: { items: Item[], limit, offset }
```

### Briefings
```
GET /api/briefings
Response: { briefings: BriefingMeta[] }

GET /api/briefings/:period/:key
Response: { period, periodKey, markdown, createdAt }

POST /api/briefings/generate
Body: { period?: 'daily' | 'weekly', limit?: number }
Response: { period, periodKey, itemCount, markdown, expectedKey }
```

### Sources
```
GET /api/sources
Response: { sources: SourceStatus[] }

POST /api/sources/:id/fetch
Response: SourceRunResult
```

### Stats
```
GET /api/stats
Response: {
  items, enriched, activeSources, last24h, tokensUsed,
  categories: [{ category, count }]
}
```

## 待决策事项

| 问题 | 当前倾向 | 待确认 |
|---|---|---|
| 前端 UI 组件库 | 纯 Tailwind 手写 | 是否后续引入 shadcn/ui |
| 部署方式 | 前后端分离 | 生产环境是否同域名 |
| 用户系统 | 无 | 后续是否需要登录/收藏 |
| 实时更新 | 30s 轮询 | 是否需要 SSE/WebSocket |
