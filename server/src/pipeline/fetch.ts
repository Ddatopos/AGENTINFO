import type { Database } from 'better-sqlite3';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { getAdapter, hasAdapter } from '../adapters/index.js';
import type { FetchContext, SourceConfig } from '../adapters/types.js';
import { httpGet, pooled } from '../lib/http.js';
import { SOURCES, UPSERT_SOURCE_SQL } from '../sources/registry.js';
import { ingestItems } from './ingest.js';

export interface SourceRunResult {
  sourceId: string;
  ok: boolean;
  httpStatus?: number;
  notModified?: boolean;
  received: number;
  inserted: number;
  duplicate: number;
  /** 已存在但热度信号被刷新的条目数（榜单类源每轮都会刷） */
  refreshed: number;
  durationMs: number;
  error?: string;
}

interface SourceRow {
  id: string;
  etag: string | null;
  last_modified: string | null;
  last_fetch_at: number | null;
  fail_streak: number;
  enabled: number;
}

/** 把 registry 同步进 sources 表，保留运行期状态（etag / last_fetch_at）。 */
export function syncSources(conn: Database = db()): void {
  const stmt = conn.prepare(UPSERT_SOURCE_SQL);
  const tx = conn.transaction(() => {
    for (const s of SOURCES) {
      stmt.run({
        id: s.id,
        name: s.name,
        kind: s.kind,
        url: s.url,
        tier: s.tier,
        authority: s.authority,
      });
    }
  });
  tx();
}

/**
 * 抓取单个源。dryRun 时只解析不写库，供 `npm run fetch -- --source=x --dry-run` 调试。
 */
export async function fetchSource(
  src: SourceConfig,
  opts: { dryRun?: boolean; conn?: Database } = {},
): Promise<SourceRunResult> {
  const conn = opts.conn ?? db();
  const started = Date.now();
  const base: SourceRunResult = {
    sourceId: src.id,
    ok: false,
    received: 0,
    inserted: 0,
    duplicate: 0,
    refreshed: 0,
    durationMs: 0,
  };

  if (!hasAdapter(src.kind)) {
    return { ...base, durationMs: 0, error: `尚未实现该类型的适配器: ${src.kind}` };
  }

  const row = conn
    .prepare(`SELECT id, etag, last_modified, last_fetch_at, fail_streak, enabled FROM sources WHERE id = ?`)
    .get(src.id) as SourceRow | undefined;

  const ctx: FetchContext = {
    etag: row?.etag ?? undefined,
    lastModified: row?.last_modified ?? undefined,
    since: row?.last_fetch_at ?? undefined,
    http: (url, init) =>
      httpGet(url, init, {
        minIntervalMs: src.minIntervalMs,
        retries: config.fetch.retries,
        timeoutMs: config.fetch.timeoutMs,
      }),
  };

  try {
    const result = await getAdapter(src.kind).fetch(src, ctx);
    const durationMs = Date.now() - started;

    // HTML 抓取器抓到 0 条通常意味着选择器失效，视为失败并告警，
    // 但绝不清空已有数据 —— 宁可停在旧数据，也不要静默回退。
    if (!result.notModified && result.items.length === 0 && src.kind === 'html') {
      throw new Error('未解析到任何条目，选择器可能已失效');
    }

    const stats = opts.dryRun
      ? { received: result.items.length, inserted: 0, duplicate: 0, refreshed: 0 }
      : ingestItems(conn, src, result.items);

    if (!opts.dryRun) {
      conn
        .prepare(
          `UPDATE sources SET etag = ?, last_modified = ?, last_fetch_at = ?, fail_streak = 0 WHERE id = ?`,
        )
        .run(result.etag ?? row?.etag ?? null, result.lastModified ?? row?.last_modified ?? null, Date.now(), src.id);

      conn
        .prepare(
          `INSERT INTO fetch_log (source_id, started_at, duration_ms, ok, http_status, new_items)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(src.id, started, durationMs, result.httpStatus ?? null, stats.inserted);
    }

    return {
      ...base,
      ok: true,
      httpStatus: result.httpStatus,
      notModified: result.notModified,
      received: stats.received,
      inserted: stats.inserted,
      duplicate: stats.duplicate,
      refreshed: stats.refreshed,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);

    if (!opts.dryRun) {
      const streak = (row?.fail_streak ?? 0) + 1;
      // 连续失败过多自动停用，避免一个死源每轮都拖慢整体
      const disable = streak >= config.disableAfterFailStreak ? 0 : 1;
      conn
        .prepare(`UPDATE sources SET fail_streak = ?, enabled = ?, last_fetch_at = ? WHERE id = ?`)
        .run(streak, disable, Date.now(), src.id);

      conn
        .prepare(
          `INSERT INTO fetch_log (source_id, started_at, duration_ms, ok, error) VALUES (?, ?, ?, 0, ?)`,
        )
        .run(src.id, started, durationMs, message);
    }

    return { ...base, durationMs, error: message };
  }
}

/** 并发抓取多个源。单源失败不影响其他源。 */
export async function fetchMany(
  sources: SourceConfig[],
  opts: { dryRun?: boolean } = {},
): Promise<SourceRunResult[]> {
  const conn = db();
  syncSources(conn);
  return pooled(sources, config.fetch.globalConcurrency, (src) =>
    fetchSource(src, { ...opts, conn }),
  );
}

/**
 * 选出该跑的源：超过所属 tier 间隔即到期。
 * 本地机器会休眠，所以不能只依赖 cron 触发 —— 每次 tick 都按 last_fetch_at 判断，
 * 顺带把睡眠期间错过的轮次补上（catch-up）。
 */
export function dueSources(conn: Database = db(), tier?: 'A' | 'B' | 'C'): SourceConfig[] {
  const rows = conn.prepare(`SELECT id, last_fetch_at, enabled FROM sources`).all() as SourceRow[];
  const state = new Map(rows.map((r) => [r.id, r]));
  const now = Date.now();

  return SOURCES.filter((s) => {
    if (tier && s.tier !== tier) return false;
    const row = state.get(s.id);
    if (row && row.enabled === 0) return false;
    if (!row?.last_fetch_at) return true;
    return now - row.last_fetch_at >= (config.tierIntervalMs[s.tier] ?? config.tierIntervalMs.A!);
  });
}
