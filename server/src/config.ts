import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// 项目根目录（agentInfo/），.env 放在这里
export const ROOT = path.resolve(here, '../..');
export const SERVER_DIR = path.resolve(here, '..');
export const DATA_DIR = path.join(SERVER_DIR, 'data');

dotenv.config({ path: path.join(ROOT, '.env') });

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 3100),
  dbPath: path.join(DATA_DIR, 'app.db'),
  briefingDir: path.join(DATA_DIR, 'briefings'),
  isProduction: process.env.NODE_ENV === 'production',

  llm: {
    apiKey: process.env.LLM_API_KEY?.trim() ?? '',
    baseUrl: process.env.LLM_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.LLM_MODEL_ID?.trim() || 'qwen-plus',
    timeout: num(process.env.LLM_TIMEOUT, 60_000),
    // 未配置 key 时走关键词规则降级，系统仍完整可用
    get enabled(): boolean {
      return this.apiKey.length > 0;
    },
    promptVersion: 1,
    maxItemsPerRun: 60,
    relevanceThreshold: 40, // 低于此分不生成摘要，控制成本
  },

  github: {
    token: process.env.GITHUB_TOKEN?.trim() ?? '',
  },

  fetch: {
    // 伪装浏览器 UA：Reddit .rss 与 HuggingFace JSON API 都要求，否则 403/返回 HTML
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    globalConcurrency: 4,
    retries: 3,
    timeoutMs: 20_000,

    /**
     * 代理。Node 22 的内置 fetch（undici）不认 HTTPS_PROXY 环境变量
     * （--use-env-proxy 要 Node 24+），而本机 github.com / huggingface.co
     * 只能走本地代理，不设的话直接 TCP 连接超时。所以这里显式读取环境变量，
     * 在 http.ts 里挂成 undici 的 dispatcher。
     * 留空则直连，不影响没有代理的环境。
     */
    proxyUrl:
      process.env.HTTPS_PROXY?.trim() ||
      process.env.https_proxy?.trim() ||
      process.env.HTTP_PROXY?.trim() ||
      process.env.http_proxy?.trim() ||
      '',
    /** 不走代理的域名（逗号分隔），匹配后缀 */
    noProxy: (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },

  // 各 tier 的抓取间隔（毫秒），调度器据此做 catch-up 补跑
  tierIntervalMs: {
    A: 60 * 60 * 1000,
    B: 6 * 60 * 60 * 1000,
    C: 24 * 60 * 60 * 1000,
  } as Record<string, number>,

  disableAfterFailStreak: 8,

  tavily: {
    apiKey: process.env.TAVILY_API_KEY?.trim() ?? '',
    get enabled(): boolean {
      return this.apiKey.length > 0;
    },
  },
} as const;
