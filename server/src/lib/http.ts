import { ProxyAgent } from 'undici';
import { config } from '../config.js';
import { db } from '../db/index.js';

/** 每个 host 串行 + 最小间隔，避免触发对方限流（arXiv TOU 要求 ~3s）。 */
const hostQueue = new Map<string, Promise<unknown>>();
const hostLastAt = new Map<string, number>();

/**
 * 代理 dispatcher，惰性构造一次复用（每请求新建会浪费连接池）。
 * Node 22 内置 fetch 不读 HTTPS_PROXY，必须显式传 dispatcher。
 */
let proxyAgent: ProxyAgent | null = null;

/** 动态代理缓存：避免每请求都查库 */
interface DynamicProxy {
  url: string;
  noProxy: string[];
  fetchedAt: number;
}
let dynamicProxy: DynamicProxy | null = null;
const DYNAMIC_PROXY_TTL = 5_000; // 5 秒 TTL

function loadDynamicProxy(): DynamicProxy {
  const now = Date.now();
  if (dynamicProxy && now - dynamicProxy.fetchedAt < DYNAMIC_PROXY_TTL) {
    return dynamicProxy;
  }

  const row = db()
    .prepare(`SELECT value FROM local_config WHERE key = 'fetch_proxy_url'`)
    .get() as { value: string } | undefined;

  const proxyUrl = row?.value?.trim() ?? '';
  const noProxy = (config.fetch.noProxy ?? []) as string[];

  dynamicProxy = { url: proxyUrl, noProxy, fetchedAt: now };
  return dynamicProxy;
}

export function getDynamicProxy(): { url: string; noProxy: string[] } {
  const d = loadDynamicProxy();
  return { url: d.url, noProxy: d.noProxy };
}

/** 当用户通过前端更新代理后，清掉缓存以便下次请求立即生效 */
export function invalidateDynamicProxy(): void {
  dynamicProxy = null;
  proxyAgent = null;
}

function dispatcherFor(host: string): ProxyAgent | undefined {
  const { url: proxyUrl, noProxy } = getDynamicProxy();

  const effectiveUrl = proxyUrl || config.fetch.proxyUrl;
  if (!effectiveUrl) return undefined;

  const lower = host.toLowerCase();
  if (noProxy.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`))) {
    return undefined;
  }

  proxyAgent ??= new ProxyAgent(effectiveUrl);
  return proxyAgent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 5xx 与 429 值得重试；4xx（除 429）是稳定错误，重试无意义。 */
function retriable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function once(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const dispatcher = dispatcherFor(hostOf(url));
  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
      headers: {
        'User-Agent': config.fetch.userAgent,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(init.headers ?? {}),
      },
      // dispatcher 不在标准 RequestInit 里，是 undici 的扩展字段
      ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 带 UA、超时、per-host 限流与指数退避重试的 fetch。
 * minIntervalMs 用于对 arXiv 这类明确要求间隔的源限速。
 */
export async function httpGet(
  url: string,
  init: RequestInit = {},
  opts: { minIntervalMs?: number; retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const host = hostOf(url);
  const minInterval = opts.minIntervalMs ?? 0;
  const retries = opts.retries ?? config.fetch.retries;
  const timeoutMs = opts.timeoutMs ?? config.fetch.timeoutMs;

  const prior = hostQueue.get(host) ?? Promise.resolve();

  const task = prior.then(async () => {
    if (minInterval > 0) {
      const last = hostLastAt.get(host) ?? 0;
      const wait = last + minInterval - Date.now();
      if (wait > 0) await sleep(wait);
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await once(url, init, timeoutMs);
        hostLastAt.set(host, Date.now());

        if (!res.ok && retriable(res.status) && attempt < retries) {
          // 优先尊重服务端给的 Retry-After
          const ra = Number(res.headers.get('retry-after'));
          const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
          await sleep(backoff);
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        hostLastAt.set(host, Date.now());
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  });

  // 让队列只保留串行关系，不因失败而中断后续请求
  hostQueue.set(
    host,
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  return task;
}

/** 简单并发池，限制同时进行的抓取任务数。 */
export async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index] as T, index);
    }
  });

  await Promise.all(runners);
  return results;
}
