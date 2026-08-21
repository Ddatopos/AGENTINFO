# agentInfo 后端已实现功能

## 系统定位

agentInfo 是一个**全球 AI/LLM/Agent 领域资讯自动聚合系统**。后端负责从全球 20+ 信息源定时抓取数据，经过去重、规则/LLM 加工、热度排序，最终生成日报/周报，并通过 REST API 供前端消费。

## 技术栈

| 组件 | 选型 |
|---|---|
| 运行时 | Node.js 22+（ESM） |
| 框架 | Express 5 + better-sqlite3 |
| 调度 | node-cron（每 15 分钟 tick） |
| LLM | OpenAI 兼容 API（DashScope / OpenRouter / 官方） |
| 抓取 | undici（Node 内置 fetch）+ rss-parser + cheerio |
| 全文检索 | SQLite FTS5 + Intl.Segmenter 中文预分词 |
| 类型安全 | TypeScript strict + Zod 运行时校验 |

## 已实现的 7 种数据源适配器

### RSS/Atom 源（rssAdapter）
- OpenAI News、ChatGPT 发布说明、Google AI Blog、Google DeepMind、GitHub Changelog、Ollama Blog、LangChain Blog
- arXiv cs.AI、HuggingFace Blog、Simon Willison、Latent Space、Lilian Weng's Blog
- TechCrunch AI、VentureBeat AI、The Decoder、MarkTechPost
- 中文源：量子位、机器之心、36氪

### GitHub 搜索（githubSearchAdapter）
- 按关键词（ai agent / llm / mcp server / rag）搜索最近创建且星数 >= 50 的仓库
- 支持自定义 queries、minStars、createdWithinDays

### GitHub Trending（githubTrendingAdapter）
- 抓取 GitHub Trending 页面，解析当日新增星数（stars_delta）
- 使用 cheerio 选择器，0 条时报错而非静默返回

### Hacker News（hnAdapter）
- 走 Algolia search_by_date API
- 按关键词分多次请求，本地去重
- 用 numericFilters 做服务端过滤（points 门槛 + 增量水位）

### HuggingFace 论文（hfPapersAdapter）
- 抓取 `/api/daily_papers`，获取每日论文列表

### HuggingFace 模型（hfModelsAdapter）
- 抓取 `/api/models`，获取热门模型榜单

### HTML 抓取（htmlAdapter）
- 通用 HTML 抓取器，通过 CSS 选择器解析
- 当前用于 Anthropic News（无 RSS 的情况）

## 数据处理流水线

```
fetch → ingest → enrich → rank → briefing
```

### 1. fetch（抓取）
- `syncSources()`：将 registry 同步进 SQLite sources 表
- `fetchSource()`：单源抓取，支持 dry-run
- `fetchMany()`：并发抓取（全局并发数 4），单源失败不影响其他源
- `dueSources()`：按 tier 间隔判断哪些源到期，支持 catch-up 补跑

### 2. ingest（入库）
- 三层去重：URL sha256 dedupe_key → 无 URL 时标题 hash → 跨源标题 hash
- 榜单类源（Trending/HN/HF）每轮刷新 metrics（stars_delta/points）
- 中文预分词写入 FTS5 seg 列，解决默认分词器切不开中文的问题

### 3. enrich（加工）
- **规则打分**：零成本，关键词匹配，覆盖全部条目
- **LLM 摘要**：只给规则分过线（>= 40）的条目调 LLM，生成中文摘要、分类、标签、相关度
- LLM 失败只标记 failed，下一轮自动重试

### 4. rank（排序）
- 热度公式：`heat = (0.55·authority + 0.45·engagement) · relevanceGate · decay`
- engagement 按源 min-max 归一，避免 GitHub 星数（万级）压垮 HN 分数（百级）
- relevance 做成乘性闸门：不相关内容热度再高也压不过闸门
- 噪音条目直接从 scores 表剔除

### 5. briefing（简报）
- 按热度取前 N 条，按分类分组，生成 Markdown
- 支持 daily（最近 24 小时）和 weekly（最近 7 天）
- 自动写入 `server/data/briefings/` 目录

## REST API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 探活，确认 SQLite 可读 |
| GET | `/api/items` | 条目列表，支持 source/category/lang/minScore/since/q/sort/limit/offset |
| GET | `/api/items/:id` | 单条详情 |
| GET | `/api/sources` | 来源状态看板 |
| POST | `/api/sources/:id/fetch` | 手动触发单源抓取 |
| GET | `/api/stats` | 顶部概览（总条目、今日新增、活跃源、token 用量、分类分布） |
| GET | `/api/briefings` | 简报列表 |
| GET | `/api/briefings/:period/:key` | 单篇简报正文 |
| POST | `/api/briefings/generate` | 手动生成简报 |

## 调度器

- 每 15 分钟 tick 一次，`dueSources()` 判断实际抓谁
- 启动即跑首轮，支持 catch-up（补跑睡眠期间错过的轮次）
- 每天 09:05 自动生成日报，周一 09:10 生成周报
- `running` 标志防重入，一轮未结束下一轮跳过

## 配置方式

所有配置集中在 `server/.env`：

| 变量 | 用途 |
|---|---|
| `PORT` | 服务端口，默认 3100 |
| `LLM_API_KEY` | OpenAI 兼容 API 密钥 |
| `LLM_BASE_URL` | API 地址，默认 DashScope |
| `LLM_MODEL_ID` | 模型名，默认 qwen-plus |
| `LLM_TIMEOUT` | LLM 超时，默认 60000ms |
| `GITHUB_TOKEN` | GitHub PAT，提升限流 10→30 req/min |
| `HTTPS_PROXY` / `HTTP_PROXY` | 出站代理（访问 GitHub/HuggingFace 需要） |

## 数据库 schema

- `sources`：来源注册表，含 etag/last_modified/last_fetch_at/fail_streak
- `items`：条目表，含 dedupe_key/title_hash/raw_text/metrics_json/raw_json
- `enrichments`：LLM/规则产出，summary_zh/tags_json/category/relevance/is_noise
- `scores`：热度分表，heat/computed_at
- `briefings`：简报表，period/period_key/content_md
- `fetch_log`：抓取日志
- `items_fts`：FTS5 全文检索虚拟表

## CLI 命令

```bash
cd server && npm run fetch      # 抓取所有来源
cd server && npm run fetch -- --source=hn --dry-run   # 单源 dry-run
cd server && npm run enrich     # 规则打分 + LLM 摘要
cd server && npm run rank       # 重算热度分
cd server && npm run briefing   # 生成日报/周报
cd server && npm run migrate    # 建库迁移
```

## 当前限制与待优化

1. 无用户系统，纯信息展示
2. 无前端，API 已就绪但无消费端
3. 无测试框架
4. 无 CORS 域名限制（开发环境全开）
5. SQLite 单写限制，高并发下可能 busy
