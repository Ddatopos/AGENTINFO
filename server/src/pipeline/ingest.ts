import type { Database } from 'better-sqlite3';
import type { NormalizedItem, SourceConfig } from '../adapters/types.js';
import { canonicalUrl, detectLang, normalizeTitle, segment, sha256, truncate } from '../lib/text.js';

export interface IngestStats {
  received: number;
  inserted: number;
  duplicate: number;
  /** 已存在但热度信号被刷新的条目数 */
  refreshed: number;
}

/**
 * 写入一批归一化条目。三层去重：
 * ① 规范化 URL 的 sha256 作为 dedupe_key（UNIQUE 约束保证幂等）
 * ② 无 URL 时退化为 源id + 归一化标题 的 hash
 * ③ title_hash 跨源比对，拦掉同一新闻的多家转载
 */
export function ingestItems(
  conn: Database,
  src: SourceConfig,
  items: NormalizedItem[],
): IngestStats {
  const insert = conn.prepare(`
    INSERT INTO items
      (source_id, dedupe_key, title_hash, url, title, author, raw_text, lang,
       published_at, ingested_at, metrics_json, raw_json)
    VALUES
      (@source_id, @dedupe_key, @title_hash, @url, @title, @author, @raw_text, @lang,
       @published_at, @ingested_at, @metrics_json, @raw_json)
    ON CONFLICT(dedupe_key) DO NOTHING
  `);

  const existsTitle = conn.prepare(
    `SELECT 1 FROM items WHERE title_hash = ? AND source_id <> ? LIMIT 1`,
  );

  const insertFts = conn.prepare(
    `INSERT INTO items_fts (rowid, title, summary_zh, seg) VALUES (?, ?, '', ?)`,
  );

  /**
   * 榜单类源（Trending / HN / HF 模型榜）每轮都会带回同一条目的最新热度信号。
   * 只 DO NOTHING 的话，第一次见到时的 stars_delta / points 会被永久冻结，
   * 一个连续三天上榜的仓库始终显示第一天的数据。所以命中重复时刷新 metrics。
   * 不动 title —— 标题以首次抓取为准。
   *
   * published_at 用 COALESCE 回填：老行可能是在适配器还不提供时间戳时入库的
   * （NULL 会让时间衰减退化成 ingested_at），一旦适配器开始给出时间就补上，
   * 已有值则保持不变。
   */
  const refreshMetrics = conn.prepare(
    `UPDATE items
        SET metrics_json = COALESCE(@metrics_json, metrics_json),
            published_at = COALESCE(published_at, @published_at)
      WHERE dedupe_key = @dedupe_key`,
  );

  const stats: IngestStats = { received: items.length, inserted: 0, duplicate: 0, refreshed: 0 };
  const now = Date.now();

  const tx = conn.transaction(() => {
    for (const item of items) {
      const title = item.title.trim();
      if (!title) continue;

      const canon = item.url ? canonicalUrl(item.url) : '';
      const titleHash = sha256(normalizeTitle(title));
      const dedupeKey = canon ? sha256(canon) : sha256(`${src.id}:${titleHash}`);

      // 跨源转载：标题一致且来自别的源，直接跳过
      if (existsTitle.get(titleHash, src.id)) {
        stats.duplicate++;
        continue;
      }

      const text = truncate(item.rawText ?? '', 4000);
      const result = insert.run({
        source_id: src.id,
        dedupe_key: dedupeKey,
        title_hash: titleHash,
        url: canon || null,
        title,
        author: item.author ?? null,
        raw_text: text || null,
        lang: detectLang(`${title} ${text}`),
        published_at: item.publishedAt ?? null,
        ingested_at: now,
        metrics_json: item.metrics ? JSON.stringify(item.metrics) : null,
        raw_json: item.raw ? JSON.stringify(item.raw) : null,
      });

      if (result.changes > 0) {
        stats.inserted++;
        // seg 列存中文预分词结果，让 FTS5 能命中中文查询
        insertFts.run(
          Number(result.lastInsertRowid),
          title,
          segment(`${title} ${text}`),
        );
      } else {
        stats.duplicate++;
        // 已存在：刷新热度信号，让榜单类源的 stars_delta / points 跟上最新值
        if (item.metrics || item.publishedAt) {
          const updated = refreshMetrics.run({
            dedupe_key: dedupeKey,
            metrics_json: item.metrics ? JSON.stringify(item.metrics) : null,
            published_at: item.publishedAt ?? null,
          });
          if (updated.changes > 0) stats.refreshed++;
        }
      }
    }
  });

  tx();
  return stats;
}

/** LLM 摘要产出后同步进 FTS，让摘要也可被搜索。 */
export function syncFtsSummary(conn: Database, itemId: number, summaryZh: string): void {
  const row = conn.prepare(`SELECT title, seg FROM items_fts WHERE rowid = ?`).get(itemId) as
    | { title: string; seg: string }
    | undefined;
  if (!row) return;

  // 使用 UPDATE 而非 DELETE + INSERT，避免中途失败导致数据丢失
  conn
    .prepare(`UPDATE items_fts SET summary_zh = ?, seg = ? WHERE rowid = ?`)
    .run(summaryZh, `${row.seg} ${segment(summaryZh)}`, itemId);
}
