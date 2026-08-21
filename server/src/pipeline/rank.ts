import type { Database } from 'better-sqlite3';
import { db } from '../db/index.js';
import { SOURCES } from '../sources/registry.js';

/**
 * 热度公式：
 *   heat = (0.55·authority + 0.45·engagement) · relevanceGate · decay
 *   engagement = log1p(原始信号) 按源归一到 0..1
 *   decay      = 1 / (1 + hours/12)^1.5   —— HN gravity 风格
 *
 * engagement 必须按源归一，否则 GitHub 星数（万级）会压垮 HN 分数（百级）。
 *
 * relevance 为什么做成乘性闸门而不是加权项：
 * 原先是 0.30·relevance/100 的加分项，相关度 25 与 85 只差 0.18，
 * 结果 GitHub Trending 上高星但与 AI 无关的仓库（实测 OpenLogi ——
 * 一个 Logitech Options 替代品，相关度 25）靠 stars_delta 冲进前五。
 * 对一个 AI 情报产品来说，不相关的内容排在首页是硬伤，
 * 所以改成乘性：不相关就整体压下去，热度再高也压不过闸门。
 */

const W_AUTHORITY = 0.55;
const W_ENGAGEMENT = 0.45;

/**
 * 相关度闸门：20 分以下压到 0.25 倍，60 分以上不惩罚，中间线性过渡。
 * 未经加工的条目按中性 50 分算（闸门 0.81），不会被永久埋掉。
 */
function relevanceGate(relevance: number): number {
  const ramp = Math.max(0, Math.min(1, (relevance - 20) / 40));
  return 0.25 + 0.75 * ramp;
}

interface RankRow {
  id: number;
  source_id: string;
  published_at: number | null;
  ingested_at: number;
  metrics_json: string | null;
  relevance: number | null;
  is_noise: number | null;
}

/** 从 metrics 里取出该源的主要热度信号 */
function engagementSignal(metrics: Record<string, number>): number {
  const candidates = [
    metrics.points,
    metrics.stars_delta,
    metrics.stars,
    metrics.upvotes,
    metrics.comments,
    metrics.trendingScore,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  }
  return 0;
}

export function timeDecay(publishedAt: number, now = Date.now()): number {
  const hours = Math.max(0, (now - publishedAt) / 3_600_000);
  return 1 / Math.pow(1 + hours / 12, 1.5);
}

export interface RankStats {
  scored: number;
  skippedNoise: number;
}

/** 重算全部条目的热度分并写入 scores 表。幂等，可反复跑。 */
export function recomputeScores(conn: Database = db(), now = Date.now()): RankStats {
  const authority = new Map(SOURCES.map((s) => [s.id, s.authority]));

  const rows = conn
    .prepare(
      `SELECT i.id, i.source_id, i.published_at, i.ingested_at, i.metrics_json,
              e.relevance, e.is_noise
         FROM items i
         LEFT JOIN enrichments e ON e.item_id = i.id`,
    )
    .all() as RankRow[];

  // 先按源统计 log1p(signal) 的极值，用于 min-max 归一
  const perSource = new Map<string, { min: number; max: number }>();
  const signals = new Map<number, number>();

  for (const row of rows) {
    const metrics = row.metrics_json ? (JSON.parse(row.metrics_json) as Record<string, number>) : {};
    const raw = Math.log1p(engagementSignal(metrics));
    signals.set(row.id, raw);

    const bucket = perSource.get(row.source_id);
    if (!bucket) perSource.set(row.source_id, { min: raw, max: raw });
    else {
      bucket.min = Math.min(bucket.min, raw);
      bucket.max = Math.max(bucket.max, raw);
    }
  }

  const upsert = conn.prepare(
    `INSERT INTO scores (item_id, heat, computed_at) VALUES (?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET heat = excluded.heat, computed_at = excluded.computed_at`,
  );
  const remove = conn.prepare(`DELETE FROM scores WHERE item_id = ?`);

  const stats: RankStats = { scored: 0, skippedNoise: 0 };

  const tx = conn.transaction(() => {
    for (const row of rows) {
      // 噪音条目直接从排序中剔除
      if (row.is_noise === 1) {
        remove.run(row.id);
        stats.skippedNoise++;
        continue;
      }

      const bucket = perSource.get(row.source_id)!;
      const raw = signals.get(row.id) ?? 0;
      const span = bucket.max - bucket.min;
      // 单条目源或所有条目信号相同时，给中等 engagement，避免被不公平对待
      const engagement = span > 0 ? (raw - bucket.min) / span : 0.5;

      const auth = authority.get(row.source_id) ?? 0.5;
      // 未经加工时给中性 50 分，避免未打分条目被永久压在最底
      const gate = relevanceGate(row.relevance ?? 50);
      const decay = timeDecay(row.published_at ?? row.ingested_at, now);

      const heat = (W_AUTHORITY * auth + W_ENGAGEMENT * engagement) * gate * decay;

      upsert.run(row.id, heat, now);
      stats.scored++;
    }
  });

  tx();
  return stats;
}
