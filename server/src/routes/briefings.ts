import { Router } from 'express';
import { db } from '../db/index.js';
import { buildBriefing, periodKeyOf, type Period } from '../pipeline/briefing.js';

export const briefingsRouter = Router();

interface BriefingRow {
  id: number;
  period: string;
  period_key: string;
  md_path: string | null;
  created_at: number;
}

/** GET /api/briefings —— 列出已生成的简报（不带正文，列表页够用） */
briefingsRouter.get('/', (_req, res) => {
  const rows = db()
    .prepare(
      `SELECT id, period, period_key, md_path, created_at
         FROM briefings ORDER BY created_at DESC LIMIT 60`,
    )
    .all() as BriefingRow[];

  res.json({
    briefings: rows.map((r) => ({
      id: r.id,
      period: r.period,
      periodKey: r.period_key,
      mdPath: r.md_path,
      createdAt: r.created_at,
    })),
  });
});

function parsePeriod(value: unknown): Period | null {
  return value === 'daily' || value === 'weekly' ? value : null;
}

/**
 * GET /api/briefings/:period/:key —— 取单篇正文
 * key 传 latest 时返回该周期最新一篇。
 */
briefingsRouter.get('/:period/:key', (req, res) => {
  const period = parsePeriod(req.params.period);
  if (!period) {
    res.status(400).json({ error: 'period 只支持 daily | weekly' });
    return;
  }

  const key = String(req.params.key);
  const conn = db();

  const row = (
    key === 'latest'
      ? conn
          .prepare(
            `SELECT period, period_key, content_md, created_at FROM briefings
              WHERE period = ? ORDER BY period_key DESC LIMIT 1`,
          )
          .get(period)
      : conn
          .prepare(
            `SELECT period, period_key, content_md, created_at FROM briefings
              WHERE period = ? AND period_key = ?`,
          )
          .get(period, key)
  ) as { period: string; period_key: string; content_md: string; created_at: number } | undefined;

  if (!row) {
    res.status(404).json({ error: '简报不存在，可用 POST /api/briefings/generate 生成' });
    return;
  }

  res.json({
    period: row.period,
    periodKey: row.period_key,
    markdown: row.content_md,
    createdAt: row.created_at,
  });
});

/** POST /api/briefings/generate —— 手动生成，前端"立即生成"按钮用 */
briefingsRouter.post('/generate', (req, res, next) => {
  try {
    const period = parsePeriod(req.body?.period) ?? 'daily';
    const limit = Number(req.body?.limit) || undefined;

    const result = buildBriefing(db(), { period, limit });
    res.json({
      period: result.period,
      periodKey: result.periodKey,
      itemCount: result.itemCount,
      markdown: result.markdown,
      // 已存在同 period_key 的会被覆盖，这里回传当前 key 方便前端跳转
      expectedKey: periodKeyOf(period),
    });
  } catch (err) {
    next(err);
  }
});
