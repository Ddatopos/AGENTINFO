# AGENTS.md

## 仓库概览

这是 **agentInfo** 单体仓库。所有服务端代码位于 `server/`；`web/` 当前未使用。项目是一个 TypeScript ESM 服务（Express + better-sqlite3），聚合 AI/LLM 新闻来源：RSS、GitHub、HN 和 HuggingFace。

### 关键目录
- `server/src/adapters/` — 各来源抓取器（RSS、HTML、GitHub、HN、HuggingFace）及其共享类型。
- `server/src/pipeline/` — 数据处理阶段：`fetch.ts`、`ingest.ts`、`enrich.ts`、`rank.ts`、`briefing.ts`。
- `server/src/routes/` — Express 路由器，提供 REST API。
- `server/src/lib/` — 共享工具：HTTP 客户端（含代理/重试）(`http.ts`)、LLM 客户端 (`llm.ts`)、文本工具 (`text.ts`)。
- `server/src/db/` — SQLite 单例和迁移。
- `server/src/sources/` — 声明式来源注册表和 upsert SQL。
- `server/data/` — SQLite 数据库和生成的 Markdown 简报（gitignore）。

## 命令

所有命令都在 `server/` 目录下运行。

```bash
# 开发模式（tsx watch）
cd server && npm run dev

# 生产启动
cd server && npm run start

# TypeScript 编译
cd server && npm run build

# 仅类型检查（不输出）
cd server && npm run typecheck

# 数据库迁移 / 重建
cd server && npm run migrate

# CLI 流水线
cd server && npm run fetch      # 抓取所有来源
cd server && npm run fetch -- --source=hn --dry-run   # 单来源 dry-run
cd server && npm run enrich     # 规则打分 + 可选 LLM 加工
cd server && npm run rank       # 重算热度分
cd server && npm run briefing   # 生成日报/周报 Markdown
```

### 运行单个测试

当前未安装测试框架。如果添加测试（推荐 `vitest`），使用：

```bash
cd server && npx vitest run src/pipeline/__tests__/fetch.test.ts
```

## 代码风格指南

### 导入
- 使用 **ESM**，导入说明符显式写 `.js` 扩展名，即使源文件是 `.ts`。
  ```ts
  import { db } from './db/index.js';
  import type { SourceConfig } from './adapters/types.js';
  ```
- 导入分组：Node 内置模块在前（`node:fs`、`node:path`），其次是外部依赖，最后是本地模块。
- 仅作类型使用的导入用 `import type`。

### 格式
- **2 空格**缩进（与现有代码库保持一致）。
- 字符串使用 **单引号**。
- 多行结构（数组、对象、函数参数）使用尾随逗号。
- 单行最大长度约 100-120 字符；SQL 和长模板字符串自然换行。

### 类型
- `tsconfig.json`：`strict: true`、`noUnusedLocals: true`、`noUncheckedIndexedAccess: true`、`esModuleInterop: true`。
- 公开形状优先使用 **interface**，联合/交叉/工具类型使用 **type alias**。
- 字面量配置对象和只读数组使用 `as const`。
- 外部数据（如 LLM 响应）使用 Zod 做运行时校验。

### 命名
- **camelCase**：变量、函数、方法、代码中的数据库列名。
- **PascalCase**：接口、类型、类。
- **UPPER_SNAKE_CASE**：SQL 常量、正则表达式。
- 文件命名：模块用 `kebab-case.ts`（如 `briefing.ts`），流水线用 `camelCase.ts`（如 `fetch.ts`）。

### 错误处理
- 始终做错误类型收窄：`err instanceof Error ? err.message : String(err)`。
- Express 错误处理器签名：`(err: unknown, req, res, next) => ...`。
- 不要静默吞掉错误；日志使用 `[模块] 上下文:` 前缀。
- 外部 API 调用按条目失败，不要整批失败。

### SQL / 数据库
- `better-sqlite3` 使用 **命名参数**（`@param`）。
- SQL 放在模板字符串或常量里；绝不要字符串拼接用户输入。
- Upsert 模式：`INSERT ... ON CONFLICT(id) DO UPDATE SET ...`。
- 在 `db/index.ts` 里为每个连接启用 WAL 模式、busy_timeout 和 foreign_keys。

### 配置
- 所有运行时配置通过 `dotenv` 集中在 `src/config.ts`。
- `.env` 放在仓库根目录；`.env` 和 `server/data/*.db` 已加入 gitignore。

## 环境变量

| 变量 | 用途 |
|---|---|
| `PORT` | 服务端口（默认 3100） |
| `LLM_API_KEY` | OpenAI 兼容 API 密钥 |
| `LLM_BASE_URL` | 接口地址（默认 DashScope） |
| `LLM_MODEL_ID` | 模型名称（默认 qwen-plus） |
| `GITHUB_TOKEN` | GitHub API 令牌（更高频率限制） |
| `HTTPS_PROXY` / `HTTP_PROXY` | 抓取用的出站代理 |

## 给代理的注意事项

- 除非明确要求，否则**不要**创建或修改 `server/` 以外的文件。
- 除非被要求，否则**不要**添加测试文件；项目目前没有测试运行器。
- 未经批准**不要**引入新依赖；先查看 `server/package.json`。
- 保留现有的中文注释和日志前缀（`[enrich]`、`[server]` 等）。
- 代码库没有格式化/代码检查工具；手动匹配现有风格。
- 添加新来源时，更新 `sources/registry.ts` 并在 `adapters/` 中实现对应的适配器；流水线其余部分会自动接入。
