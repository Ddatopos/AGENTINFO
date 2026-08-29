# agentInfo 项目简介

## 项目定位

agentInfo 是一个 **AI 驱动的全球情报聚合平台**，自动从全球 37+ 优质数据源（RSS、GitHub、Hacker News、HuggingFace 等）实时抓取 AI/LLM/Agent 领域资讯，通过 AI 自动分类、打分、生成中文摘要，并按热度排序，最终生成日报/周报，帮助开发者一步洞察 AI 领域最新动态。

---

## 解决的问题

AI/LLM/Agent 领域信息高度分散，开发者面临以下痛点：

- **信息分散**：官方博客、论文、GitHub、社区讨论散布在数十个平台，手动追踪成本极高
- **语言障碍**：优质内容以英文为主，中文开发者获取门槛高
- **噪音过滤**：大量营销、股价、无关内容混入，人工筛选效率低
- **时效性**：错过关键发布或论文窗口，后续追赶代价大
- **情报深度**：仅看标题无法判断内容价值，需要摘要辅助决策

agentInfo 通过自动化抓取、智能去重、规则打分、LLM 摘要、热度排序，一站式解决上述问题。

---

## 目标用户与使用场景

### 目标用户

- **AI 开发者**：追踪框架更新、模型发布、最佳实践
- **研究者**：关注 arXiv 论文、学术动态、技术趋势
- **产品经理**：了解竞品动态、行业融资、技术可行性
- **投资人/分析师**：快速把握 AI 行业脉搏、识别趋势信号
- **技术决策者**：评估新技术选型、制定技术战略

### 使用场景

- **日常情报追踪**：每天打开平台，查看昨日热点和今日趋势
- **技术调研**：搜索特定方向（如 RAG、MCP、Agent 框架）的高质量内容
- **竞品监测**：追踪 OpenAI、Anthropic、Google 等官方动态
- **周报/月报**：自动生成的日报/周报，用于团队分享或个人回顾
- **AI 对话辅助**：通过内置 AI 对话助手，深入追问任意条目

---

## 核心功能

### 1. 实时数据聚合

- **37+ 数据源**，按 Tier A（每小时）、Tier B（每 6 小时）、Tier C（每天）分级调度
- 覆盖 RSS/Atom、GitHub Search、GitHub Trending、Hacker News（Algolia API）、HuggingFace 论文/模型榜、HTML 抓取等多种协议
- ETag/Last-Modified 条件请求，304 短路减少带宽
- 增量水位（`ctx.since`）只取新增内容

### 2. 智能内容加工

- **零成本规则打分**：关键词匹配（强/中/噪音特征词），覆盖全部条目，无需 LLM
- **LLM 智能摘要**（可选）：生成 1-2 句中文摘要、自动分类、3-6 个技术标签、相关度评分
- **降级机制**：未配置 LLM_API_KEY 时，系统依然完整可用，仅缺少摘要
- **噪音过滤**：自动标记营销、股价等无关内容，直接从榜单剔除

### 3. 多维度排序与检索

- **热度排序**：`heat = (0.55·authority + 0.45·engagement) · relevanceGate · decay`
- **乘性相关性闸门**：不相关内容热度再高也压不过闸门
- **按源归一 engagement**：log1p 后 min-max 归一，避免 GitHub 星数（万级）压垮 HN 分数（百级）
- **全文检索**：SQLite FTS5 + Intl.Segmenter 中文预分词，支持中英文混合搜索

### 4. 自动简报生成

- 按热度取前 N 条，按分类分组，生成 Markdown 日报/周报
- 自动写入 `server/data/briefings/` 目录
- 每天 09:05 自动生成日报，周一 09:10 生成周报

### 5. AI 对话助手

- 基于 LLM 的流式对话，多会话管理
- SSE 实时推送响应
- 支持追问任意条目的详细信息

### 6. 来源状态看板

- 每个源的条目数、上次抓取时间、失败次数、最后错误一目了然
- 支持手动触发单源抓取
- 连续失败 8 次自动停用，避免无效请求

### 7. 外部搜索增强

- 集成 Tavily API 支持联网搜索（可选）
- 内部 FTS 搜索 + 外部搜索双通道

---

## 技术方案

### 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    agentInfo 架构总览                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌────────────┐    ┌─────────────────┐     │
│  │ 37 数据源 │───▶│  7 种适配器 │───▶│ NormalizedItem  │     │
│  │(RSS/API) │    │ (归一化)    │    │  (统一数据结构)  │     │
│  └──────────┘    └────────────┘    └─────────────────┘     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           数据处理流水线 (Pipeline)                     │   │
│  │                                                      │   │
│  │  fetch ──▶ ingest ──▶ enrich ──▶ rank ──▶ briefing   │   │
│  │  抓取      三层去重   规则+LLM   热度排序   Markdown   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SQLite 数据库                             │   │
│  │  sources / items / enrichments / scores / briefings   │   │
│  │  + FTS5 全文检索 + WAL 模式                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Express REST API                          │   │
│  │  /api/items /sources /briefings /chat /stats /config  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              node-cron 自动调度                         │   │
│  │  每 15 分钟 tick ── 到期源自动抓取 + enrich + rank     │   │
│  │  每天 09:05 ── 日报  周一 09:10 ── 周报               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 后端技术栈

| 组件 | 选型 |
|------|------|
| 运行时 | Node.js 22+ (ESM) |
| 语言 | TypeScript 5.7 (strict mode) |
| 框架 | Express 5.1 |
| 数据库 | SQLite (better-sqlite3 13.0.3) + FTS5 全文检索 |
| LLM | OpenAI SDK 4.104（兼容 DashScope / DeepSeek / OpenRouter 等） |
| 调度 | node-cron 3.0.3 |
| HTTP 客户端 | undici (Node 内置 fetch) + rss-parser + cheerio |
| 数据校验 | Zod 3.24.1 |
| 开发工具 | tsx 4.19.2 |

### 前端技术栈（规划中）

| 组件 | 选型 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite |
| UI | Tailwind CSS（纯手写） |
| 状态 | Zustand + React Query (TanStack Query) |
| 路由 | React Router v6 |
| Markdown | react-markdown |

### 数据处理流水线

```
fetch → ingest → enrich → rank → briefing
```

**fetch（抓取）**：并发抓取 37 个数据源，按 Tier 分级调度，单源失败不影响其他源，连续失败 8 次自动停用。

**ingest（入库）**：三层去重（URL hash → 标题 hash → 跨源标题 hash），榜单类源刷新 metrics，中文预分词写入 FTS5。

**enrich（加工）**：零成本规则打分覆盖全部条目，LLM 摘要只给高分条目，失败自动重试。

**rank（排序）**：热度公式综合权威度、互动量、相关性闸门、时间衰减，噪音条目直接剔除。

**briefing（简报）**：按热度取前 N 条，按分类分组，生成 Markdown 日报/周报。

### 数据库架构

- **8 张主表**：`sources`、`items`、`enrichments`、`scores`、`briefings`、`fetch_log`、`conversations`、`messages`
- **1 张虚拟表**：`items_fts`（FTS5 全文检索）
- WAL 模式 + busy_timeout + foreign_keys
- 分表存储原始数据与 LLM 产出，重跑 LLM 不影响已抓内容

### REST API

提供 20+ 端点，涵盖条目 CRUD、来源看板、简报管理、AI 对话（SSE）、LLM 健康检查、代理配置读写等。

### 调度器

- 每 15 分钟 tick，靠 `dueSources()` 判断实际抓谁
- 启动即跑首轮，支持 catch-up 补跑
- 每天 09:05 自动生成日报，周一 09:10 生成周报
- `running` 标志防重入

---

## 创新点

1. **零成本降级机制**：未配置 LLM_API_KEY 时，系统依然完整可用（规则打分兜底），前端回落到正文摘录
2. **三层去重策略**：URL hash → 标题 hash → 跨源标题 hash，有效处理转载和榜单刷新
3. **中文全文检索**：FTS5 + Intl.Segmenter 预分词，无需引入 jieba 等原生依赖，纯 Node.js 解决
4. **乘性相关性闸门**：不相关内容热度再高也压不过闸门，避免无关内容冲榜（实测修复了 GitHub Trending 上高星但与 AI 无关仓库霸榜的问题）
5. **按源归一 engagement**：log1p 后 min-max 归一，避免 GitHub 星数（万级）压垮 HN 分数（百级）
6. **条件请求 + 增量水位**：ETag/Last-Modified 304 短路 + `ctx.since` 只取新增，大幅减少带宽和去重开销
7. **动态代理缓存**：前端可通过 API 实时更新代理配置，后端 5 秒 TTL 缓存 + 按域名 bypass
8. **榜单类源 metrics 刷新**：命中重复时更新 stars_delta/points，不覆盖标题，让连续上榜的仓库保持最新热度信号
9. **规则打分计票制分类**：避免 arXiv 论文被首个命中词误判为"模型发布"
10. **LLM 失败重试机制**：单条失败只标记 failed，下一轮自动重试，超过 3 次放弃，避免永久性错误无限重试

---

## 当前完成情况

### 后端：✅ 全部完成

- ✅ 37 个数据源，7 种适配器实现
- ✅ 五阶段数据处理流水线（fetch → ingest → enrich → rank → briefing）
- ✅ SQLite 数据库，含 FTS5 全文检索
- ✅ 20+ REST API 端点
- ✅ node-cron 自动调度器
- ✅ AI 对话助手（SSE 流式）
- ✅ 来源状态看板
- ✅ 外部搜索增强（Tavily）
- ✅ 动态代理配置

### 前端：⏳ 待搭建

- ⏳ 设计稿已完成（plan.md）
- ⏳ API 契约已定义
- ⏳ 前端技术栈已确定（React 18 + Vite + Tailwind + Zustand + React Query）
- ⏳ 等待从零搭建

### 数据

- 需手动触发 `fetch/enrich` 初始化数据

---

## 项目使用方式

### 快速启动（后端）

```bash
cd server
npm install
cp ../.env.example ../.env
# 编辑 .env 填入 API Key（LLM_API_KEY 可选）
npm run dev
# 服务启动在 http://localhost:3100
```

### 初始化数据

```bash
cd server
npm run fetch               # 抓取所有来源
npm run enrich              # 规则打分 + LLM 摘要（可选）
npm run rank                # 重算热度分
```

### 常用 CLI 命令

```bash
cd server

# 抓取
npm run fetch                              # 抓取所有来源
npm run fetch -- --source=hn --dry-run    # 单源 dry-run
npm run fetch -- --tier=A                  # 抓某一档
npm run fetch -- --due                     # 抓到期的源

# 加工
npm run enrich                             # 规则打分 + LLM 摘要
npm run enrich -- --limit=20               # 限制 LLM 条数
npm run enrich -- --force                  # 强制重新生成摘要
npm run enrich -- --rescore                # 全库重跑规则分

# 排序与简报
npm run rank                               # 重算热度分
npm run briefing                           # 生成日报
npm run briefing -- --period=weekly        # 生成周报
npm run briefing -- --stdout               # 只打印不写文件

# 数据库
npm run migrate                            # 建库/校验
npm run migrate -- --rebuild-fts           # 重建全文索引
```

### 环境变量

| 变量 | 用途 | 默认值 | 必需 |
|------|------|--------|------|
| `PORT` | 服务端口 | 3100 | 否 |
| `LLM_API_KEY` | OpenAI 兼容 API 密钥 | - | 否（降级可用） |
| `LLM_BASE_URL` | API 地址 | DashScope | 否 |
| `LLM_MODEL_ID` | 模型名 | qwen-plus | 否 |
| `LLM_TIMEOUT` | LLM 超时 | 60000ms | 否 |
| `GITHUB_TOKEN` | GitHub PAT | - | 否（提升限流） |
| `HTTPS_PROXY` / `HTTP_PROXY` | 出站代理 | - | 视网络环境 |
| `NO_CRON` | 禁用调度器 | - | 否（=1 时禁用） |

---

---

# 附：纯文字版（无架构图）

## 项目定位

agentInfo 是一个 AI 驱动的全球情报聚合平台，自动从全球 37+ 优质数据源（RSS、GitHub、Hacker News、HuggingFace 等）实时抓取 AI/LLM/Agent 领域资讯，通过 AI 自动分类、打分、生成中文摘要，并按热度排序，最终生成日报/周报，帮助开发者一步洞察 AI 领域最新动态。

## 解决的问题

AI/LLM/Agent 领域信息高度分散，开发者面临信息分散、语言障碍、噪音过滤、时效性和情报深度五大痛点。agentInfo 通过自动化抓取、智能去重、规则打分、LLM 摘要、热度排序，一站式解决上述问题。

## 目标用户与使用场景

目标用户包括 AI 开发者、研究者、产品经理、投资人/分析师和技术决策者。使用场景涵盖日常情报追踪、技术调研、竞品监测、周报/月报生成和 AI 对话辅助。

## 核心功能

核心功能包括：实时数据聚合（37+ 数据源，Tier 分级调度）、智能内容加工（零成本规则打分 + 可选 LLM 摘要 + 降级机制 + 噪音过滤）、多维度排序与检索（热度公式 + 乘性相关性闸门 + FTS5 全文检索）、自动简报生成（日报/周报，定时触发）、AI 对话助手（流式 SSE 多会话）、来源状态看板（手动触发 + 自动停用）、外部搜索增强（Tavily 可选）。

## 技术方案

后端采用 Node.js 22+ ESM + TypeScript strict + Express 5 + better-sqlite3 + FTS5 + OpenAI SDK + node-cron 技术栈。数据处理流水线为五阶段管道：fetch（并发抓取 37 个数据源）→ ingest（三层去重 + FTS 同步）→ enrich（规则打分 + LLM 摘要）→ rank（热度排序）→ briefing（Markdown 简报生成）。数据库采用 SQLite，含 8 张主表和 1 张 FTS5 虚拟表，启用 WAL 模式。REST API 提供 20+ 端点。node-cron 每 15 分钟 tick，自动调度抓取和简报生成。

前端规划采用 React 18 + Vite + Tailwind CSS + Zustand + React Query + React Router v6 技术栈，设计稿已完成，API 契约已定义，等待从零搭建。

## 创新点

十大创新点包括：零成本降级机制、三层去重策略、中文全文检索（Intl.Segmenter 预分词）、乘性相关性闸门、按源归一 engagement、条件请求 + 增量水位、动态代理缓存、榜单类源 metrics 刷新、规则打分计票制分类、LLM 失败重试机制。

## 当前完成情况

后端全部完成，包括 37 个数据源、7 种适配器、五阶段流水线、SQLite 数据库、20+ REST API 端点、node-cron 调度器、AI 对话助手、来源看板、外部搜索增强和动态代理配置。前端设计稿和 API 契约已就绪，等待从零搭建。数据需手动触发 fetch/enrich 初始化。

## 项目使用方式

快速启动：cd server && npm install && cp ../.env.example ../.env && npm run dev。初始化数据：npm run fetch && npm run enrich && npm run rank。常用 CLI 包括 fetch（抓取）、enrich（加工）、rank（排序）、briefing（简报）、migrate（数据库）。环境变量集中在 server/.env，LLM_API_KEY 可选（降级可用），GITHUB_TOKEN 可选（提升限流），HTTPS_PROXY 视网络环境配置。
