import { Router } from 'express';
import { db } from '../db/index.js';
import { findSource } from '../sources/registry.js';
import { fetchSource } from '../pipeline/fetch.js';
import { recomputeScores } from '../pipeline/rank.js';

export const sourcesRouter = Router();

interface SourceStatusRow {
  id: string;
  name: string;
  kind: string;
  tier: string;
  authority: number;
  enabled: number;
  last_fetch_at: number | null;
  fail_streak: number;
  item_count: number;
  last_error: string | null;
}

/** GET /api/sources —— 看板侧栏用：每个源的条目数、上次抓取时间、失败情况 */
sourcesRouter.get('/', (_req, res) => {
  const rows = db()
    .prepare(
      `SELECT s.id, s.name, s.kind, s.tier, s.authority, s.enabled, s.last_fetch_at, s.fail_streak,
              (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count,
              (SELECT error FROM fetch_log fl WHERE fl.source_id = s.id AND fl.ok = 0
                ORDER BY fl.started_at DESC LIMIT 1) AS last_error
         FROM sources s
        ORDER BY s.tier, s.name`,
    )
    .all() as SourceStatusRow[];

  res.json({
    sources: rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      tier: r.tier,
      authority: r.authority,
      enabled: r.enabled === 1,
      lastFetchAt: r.last_fetch_at,
      failStreak: r.fail_streak,
      itemCount: r.item_count,
      lastError: r.last_error,
    })),
  });
});

/** POST /api/sources/:id/fetch —— 手动触发单源抓取，调试用 */
sourcesRouter.post('/:id/fetch', async (req, res, next) => {
  try {
    const src = findSource(String(req.params.id));
    if (!src) {
      res.status(404).json({ error: '未找到该数据源' });
      return;
    }
    const result = await fetchSource(src);
    recomputeScores();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/stats —— 顶部概览 */
export const statsRouter = Router();

statsRouter.get('/', (_req, res) => {
  const conn = db();
  const totals = conn
    .prepare(
      `SELECT (SELECT COUNT(*) FROM items i JOIN enrichments e ON e.item_id = i.id WHERE e.is_noise = 0 AND e.relevance >= 50) AS items,
              (SELECT COUNT(*) FROM enrichments WHERE failed = 0 AND relevance >= 50) AS enriched,
              (SELECT COUNT(*) FROM sources WHERE enabled = 1) AS active_sources,
              (SELECT COUNT(*) FROM items i JOIN enrichments e ON e.item_id = i.id WHERE i.ingested_at >= ? AND e.is_noise = 0 AND e.relevance >= 50) AS today,
              (SELECT COALESCE(SUM(tokens_in + tokens_out), 0) FROM enrichments) AS tokens,
              (SELECT COALESCE(ROUND(AVG(relevance)), 0) FROM enrichments WHERE failed = 0 AND relevance IS NOT NULL AND relevance >= 50) AS avg_relevance`,
    )
    .get(Date.now() - 86_400_000) as {
      items: number;
      enriched: number;
      active_sources: number;
      today: number;
      tokens: number;
      avg_relevance: number;
    };

  const categories = conn
    .prepare(
      `SELECT COALESCE(category, '未分类') AS category, COUNT(*) AS count
         FROM enrichments WHERE is_noise = 0 AND relevance >= 50 GROUP BY category ORDER BY count DESC`,
    )
    .all() as Array<{ category: string; count: number }>;

  res.json({
    items: totals.items,
    enriched: totals.enriched,
    activeSources: totals.active_sources,
    last24h: totals.today,
    tokensUsed: totals.tokens,
    avgRelevance: totals.avg_relevance,
    categories,
  });
});
