# AGENTINFO

<div align="center">

🐱 **AI 驱动的全球情报聚合平台**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[在线演示](#) | [快速开始](#快速开始) | [功能特性](#功能特性) | [数据源](#数据源)

</div>

---

## 📖 项目简介

AGENTINFO 是一个智能化的 AI/LLM 情报聚合平台，实时抓取并分析全球 26+ 优质数据源，通过 AI 自动分类、打分、生成摘要，帮助开发者一步洞察 AI 领域的最新动态。

### 核心能力

- 🔥 **实时聚合**：每小时自动抓取 Hacker News、GitHub、HuggingFace 等热门平台
- 🤖 **智能分析**：LLM 自动生成中文摘要、分类、标签
- 📊 **热度排序**：综合考虑权威度、互动量、相关性、时间衰减
- 🔍 **全文检索**：支持中英文混合搜索，智能分词
- 📱 **响应式设计**：完美适配桌面和移动端

---

## ✨ 功能特性

### 1. 智能分类筛选

- **开发工具**：AI 编码助手、框架、SDK
- **论文研究**：arXiv 论文、学术研究
- **模型发布**：新模型发布、版本更新
- **行业动态**：融资、收购、合作
- **教程指南**：官方文档、教程、快速开始
- **观点评论**：行业观点、深度分析

### 2. 多维度排序

- **热度排序**：综合权威度、互动量、相关性
- **时间排序**：按发布时间倒序
- **相关性过滤**：只显示高质量内容（relevance ≥ 50）

### 3. AI 智能处理

- **自动摘要**：LLM 生成 1-2 句中文摘要
- **智能分类**：自动识别内容类型
- **关键词提取**：提取 3-6 个技术标签
- **噪音过滤**：自动过滤营销、股价等无关内容

### 4. 全文检索

- **中英文支持**：智能分词，支持中英文混合搜索
- **实时索引**：新内容立即可搜索
- **语义理解**：理解查询意图，返回相关结果

---

## 🛠️ 技术栈

### 后端

- **运行时**：Node.js 22+ (ESM)
- **语言**：TypeScript 5.0+
- **框架**：Express.js
- **数据库**：SQLite (better-sqlite3) + FTS5 全文检索
- **LLM**：OpenAI SDK（兼容 DashScope、DeepSeek 等）
- **数据验证**：Zod

### 前端

- **框架**：React 18
- **语言**：TypeScript
- **路由**：React Router v6
- **状态管理**：Zustand
- **数据获取**：TanStack Query (React Query)
- **样式**：Tailwind CSS

### 数据源适配器

- **RSS**：rss-parser
- **HTML**：cheerio (类 jQuery 选择器)
- **GitHub**：REST API + HTML 抓取
- **Hacker News**：Algolia API
- **HuggingFace**：官方 API

---

## 🚀 快速开始

### 前置要求

- Node.js 22+
- npm 或 pnpm
- LLM API Key（可选，不配置则使用关键词规则）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/yourusername/agentinfo.git
cd agentinfo

# 安装依赖
cd server
npm install

cd ../web
npm install

# 配置环境变量
cp ../.env.example ../.env
# 编辑 .env 文件，填入 API Key
```

### 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# LLM 配置（推荐使用阿里云 DashScope）
LLM_API_KEY=your_dashscope_api_key
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL_ID=qwen-plus
LLM_TIMEOUT=60000

# 或者使用 DeepSeek
# LLM_API_KEY=your_deepseek_api_key
# LLM_BASE_URL=https://api.deepseek.com/v1
# LLM_MODEL_ID=deepseek-chat

# GitHub PAT（可选，提升速率限制）
GITHUB_TOKEN=your_github_token

# 后端端口
PORT=3100

# 代理（可选）
HTTPS_PROXY=http://127.0.0.1:7897
```

### 启动服务

```bash
# 启动后端（开发模式）
cd server
npm run dev

# 启动前端（开发模式）
cd web
npm run dev

# 生产构建
cd server
npm run build
npm run start
```

访问 http://localhost:3100 查看效果。

---

## 📊 数据源

### Tier A（每小时更新）

| 数据源 | 类型 | 说明 |
|--------|------|------|
| Hacker News | API | 技术社区热门 |
| GitHub 新热门项目 | API | AI 相关新项目 |
| GitHub Trending | HTML | 每日热门仓库 |
| HuggingFace 每日论文 | API | AI 论文精选 |
| HuggingFace 热门模型 | API | 模型下载排行 |

### Tier B（每 6 小时更新）

| 数据源 | 类型 | 说明 |
|--------|------|------|
| OpenAI News | RSS | 官方新闻 |
| ChatGPT 发布说明 | RSS | 版本更新 |
| Anthropic News | HTML | Claude 官方动态 |
| Google AI Blog | RSS | Google AI 研究 |
| Google DeepMind | RSS | DeepMind 研究 |
| GitHub Changelog | RSS | 平台更新 |
| Ollama Blog | RSS | 本地模型 |
| LangChain Blog | RSS | 框架动态 |

### Tier C（每天更新）

| 数据源 | 类型 | 说明 |
|--------|------|------|
| arXiv cs.AI | RSS | AI 学术论文 |
| HuggingFace Blog | RSS | 技术博客 |
| HuggingFace Course | RSS | 官方教程 |
| Simon Willison | RSS | 技术专家博客 |
| Latent Space | RSS | AI 行业深度 |
| Lilian Weng's Blog | RSS | AI 技术博客 |
| PyTorch Blog | RSS | PyTorch 官方 |
| Keras Blog | RSS | Keras 官方 |
| Distill | RSS | 可视化教程 |
| TechCrunch AI | RSS | 科技媒体 |
| VentureBeat AI | RSS | 商业科技 |
| The Decoder | RSS | AI 新闻 |
| MarkTechPost | RSS | 技术资讯 |
| Import AI | RSS | AI 新闻与教程 |

### 中文源

| 数据源 | 类型 | 说明 |
|--------|------|------|
| 量子位 | RSS | AI 垂直媒体 |
| 机器之心 | RSS | AI 技术媒体 |
| 36 氪 | RSS | 科技商业 |

---

## 📖 使用指南

### 基本操作

1. **浏览热点**：首页显示今日热点，按热度排序
2. **分类筛选**：左侧选择分类，查看特定类型内容
3. **搜索内容**：顶部搜索框，支持中英文关键词
4. **查看详情**：点击条目跳转到原文

### 高级功能

#### 查看全部数据

点击"查看全部"按钮，加载更多历史数据（最多 200 条）。

#### 手动触发抓取

```bash
cd server

# 抓取所有源
npm run fetch

# 抓取单个源
npm run fetch -- --source=github_search

# 抓取特定 Tier
npm run fetch -- --tier=A

# 抓取到期的源
npm run fetch -- --due
```

#### 手动触发 LLM 加工

```bash
cd server

# 加工待处理条目
npm run enrich

# 限制条目数
npm run enrich -- --limit=20

# 强制重新加工
npm run enrich -- --force

# 全库重跑规则打分
npm run enrich -- --rescore
```

#### 生成简报

```bash
cd server

# 生成日报
npm run briefing

# 生成周报
npm run briefing -- --period=weekly

# 只打印不写文件
npm run briefing -- --stdout
```

---

## 🏗️ 项目结构

```
agentinfo/
├── server/                 # 后端代码
│   ├── src/
│   │   ├── adapters/       # 数据源适配器
│   │   ├── pipeline/       # 数据处理流水线
│   │   │   ├── fetch.ts    # 抓取
│   │   │   ├── ingest.ts   # 入库
│   │   │   ├── enrich.ts   # LLM 加工
│   │   │   ├── rank.ts     # 热度计算
│   │   │   └── briefing.ts # 简报生成
│   │   ├── routes/         # Express 路由
│   │   ├── lib/            # 工具库
│   │   │   ├── http.ts     # HTTP 客户端
│   │   │   ├── llm.ts      # LLM 客户端
│   │   │   └── text.ts     # 文本处理
│   │   ├── db/             # 数据库层
│   │   ├── sources/        # 数据源注册表
│   │   └── index.ts        # 入口
│   ├── data/               # 数据库和简报
│   └── package.json
│
├── web/                    # 前端代码
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── screens/        # 页面
│   │   ├── api/            # API 客户端
│   │   └── main.tsx        # 入口
│   └── package.json
│
└── .env                    # 环境变量
```

---

## 🔧 开发指南

### 添加新数据源

1. **在 `sources/registry.ts` 中注册**：

```typescript
{
  id: 'my_source',
  name: 'My Source',
  kind: 'rss', // 或 'html', 'github_search' 等
  url: 'https://example.com/rss',
  tier: 'B',
  authority: 0.8,
}
```

2. **实现适配器**（如果 kind 是新的）：

在 `adapters/` 目录下创建新文件，实现 `Adapter` 接口。

3. **测试**：

```bash
npm run fetch -- --source=my_source --dry-run
```

### 修改关键词规则

编辑 `pipeline/keywords.ts`：

```typescript
const STRONG = [
  'ai agent', 'llm', 'mcp', // ...
  'your_keyword', // 添加新关键词
];
```

### 修改热度公式

编辑 `pipeline/rank.ts` 中的 `recomputeScores` 函数。

---

## 📈 性能优化

### 数据库

- 使用 WAL 模式，提升并发性能
- FTS5 全文检索，毫秒级响应
- 合理的索引策略

### 前端

- React Query 缓存，减少重复请求
- 虚拟滚动（计划中）
- 懒加载组件

### 后端

- 条件请求（ETag / If-Modified-Since）
- 请求去重
- 速率限制处理

---

## 🤝 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范

- 使用 2 空格缩进
- 字符串使用单引号
- 导入使用 ESM 规范，显式 `.js` 扩展名
- 类型使用 TypeScript 严格模式
- 错误处理使用 `err instanceof Error`

---

## 📝 更新日志

### v1.0.0 (2026-08-21)

- ✨ 初始版本发布
- 🔥 支持 26+ 数据源
- 🤖 LLM 自动摘要和分类
- 📊 热度排序和相关性过滤
- 🔍 全文检索
- 📱 响应式设计

---

## 🙏 致谢

### 数据源

感谢以下平台提供优质的 API 和 RSS：

- [Hacker News](https://news.ycombinator.com/)
- [GitHub](https://github.com/)
- [HuggingFace](https://huggingface.co/)
- [OpenAI](https://openai.com/)
- [Anthropic](https://www.anthropic.com/)
- [arXiv](https://arxiv.org/)

### 技术栈

- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 📮 联系方式

- 项目主页：https://github.com/yourusername/agentinfo
- 问题反馈：https://github.com/yourusername/agentinfo/issues
- 邮箱：your.email@example.com

---

<div align="center">

Made with ❤️ by AGENTINFO Team

⭐ 如果这个项目对你有帮助，请给一个 Star！⭐

</div>
