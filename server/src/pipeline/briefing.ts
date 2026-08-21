import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { config } from '../config.js';
import { db } from '../db/index.js';

/**
 * 简报生成：把一段时间内热度最高的条目按分类汇总成 Markdown。
 *
 * 不依赖 LLM —— 排序和分类已经由 rank / enrich 阶段做完，
 * 这里只做组装。配了 LLM 的话条目自带中文摘要，没配就回落到正文摘录，
 * 两种情况下简报都能读。
 */

export type Period = 'daily' | 'weekly';

interface BriefItem {
  id: number;
  title: string;
  url: string | null;
  source_name: string;
  summary_zh: string | null;
  raw_text: string | null;
  category: string | null;
  relevance: number | null;
  heat: number;
  published_at: number | null;
  ingested_at: number;
  metrics_json: string | null;
}

export interface BriefingResult {
  period: Period;
  periodKey: string;
  itemCount: number;
  markdown: string;
  mdPath: string | null;
}

/** daily -> 2026-08-20；weekly -> 2026-W34（ISO 周） */
export function periodKeyOf(period: Period, at = new Date()): string {
  const y = at.getUTCFullYear();
  if (period === 'daily') {
    const m = String(at.getUTCMonth() + 1).padStart(2, '0');
    const d = String(at.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ISO 8601 周数：以周四所在年为准，周一为一周之始
  const target = new Date(Date.UTC(y, at.getUTCMonth(), at.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 摘要优先用 LLM 产出，没有就截取正文，都没有则留空 */
function summaryOf(item: BriefItem, max = 160): string {
  const text = (item.summary_zh ?? item.raw_text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** 热度信号里挑一个有代表性的展示（★1.2k / 128 分） */
function metricBadge(item: BriefItem): string {
  if (!item.metrics_json) return '';
  const m = JSON.parse(item.metrics_json) as Record<string, number>;

  const compact = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  if (typeof m.stars_delta === 'number' && m.stars_delta > 0) return `★ +${compact(m.stars_delta)} 今日`;
  if (typeof m.stars === 'number' && m.stars > 0) return `★ ${compact(m.stars)}`;
  if (typeof m.points === 'number' && m.points > 0) return `${m.points} 分 / ${m.comments ?? 0} 评论`;
  if (typeof m.upvotes === 'number' && m.upvotes > 0) return `${m.upvotes} 赞`;
  if (typeof m.downloads === 'number' && m.downloads > 0) return `${compact(m.downloads)} 下载`;
  return '';
}

/**
 * 生成简报。
 * daily 看 24 小时，weekly 看 7 天；按热度取前 N 条，再按分类分组。
 */
export function buildBriefing(
  conn: Database = db(),
  opts: { period?: Period; limit?: number; at?: Date; write?: boolean } = {},
): BriefingResult {
  const period = opts.period ?? 'daily';
  const at = opts.at ?? new Date();
  const limit = opts.limit ?? (period === 'daily' ? 20 : 40);
  const windowMs = period === 'daily' ? 86_400_000 : 7 * 86_400_000;
  const periodKey = periodKeyOf(period, at);

  const items = conn
    .prepare(
      `SELECT i.id, i.title, i.url, s.name AS source_name,
              e.summary_zh, i.raw_text, e.category, e.relevance,
              sc.heat, i.published_at, i.ingested_at, i.metrics_json
         FROM items i
         JOIN sources s ON s.id = i.source_id
         JOIN scores sc ON sc.item_id = i.id
         LEFT JOIN enrichments e ON e.item_id = i.id
        WHERE COALESCE(e.is_noise, 0) = 0
          AND COALESCE(i.published_at, i.ingested_at) >= @after
        ORDER BY sc.heat DESC
        LIMIT @limit`,
    )
    .all({ after: at.getTime() - windowMs, limit }) as BriefItem[];

  // 分类分组，保持热度顺序
  const groups = new Map<string, BriefItem[]>();
  for (const item of items) {
    const key = item.category ?? '其他';
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const title = period === 'daily' ? `AI 情报日报 ${periodKey}` : `AI 情报周报 ${periodKey}`;
  const lines: string[] = [`# ${title}`, ''];

  if (items.length === 0) {
    lines.push('这个时间窗口内没有条目。先运行 `npm run fetch` 抓取，再运行 `npm run enrich` 打分。', '');
  } else {
    const span =
      period === 'daily'
        ? '最近 24 小时'
        : `${fmtDate(at.getTime() - windowMs)} 至 ${fmtDate(at.getTime())}`;
    lines.push(`> ${span}，共 ${items.length} 条，来自 ${new Set(items.map((i) => i.source_name)).size} 个源`, '');

    // 分类内按条目数降序，信息量大的分类排前面
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [category, bucket] of sorted) {
      lines.push(`## ${category}（${bucket.length}）`, '');
      for (const item of bucket) {
        const badge = metricBadge(item);
        const meta = [item.source_name, badge].filter(Boolean).join(' · ');
        lines.push(`- **[${item.title}](${item.url ?? '#'})**`);
        lines.push(`  ${meta}`);
        const summary = summaryOf(item);
        if (summary) lines.push(`  ${summary}`);
        lines.push('');
      }
    }
  }

  lines.push('---', '', `由 agentInfo 生成于 ${new Date().toISOString()}`, '');
  const markdown = lines.join('\n');

  let mdPath: string | null = null;
  if (opts.write !== false) {
    fs.mkdirSync(config.briefingDir, { recursive: true });
    mdPath = path.join(config.briefingDir, `${period}-${periodKey}.md`);
    fs.writeFileSync(mdPath, markdown, 'utf8');

    conn
      .prepare(
        `INSERT INTO briefings (period, period_key, md_path, content_md, created_at)
         VALUES (@period, @period_key, @md_path, @content_md, @created_at)
         ON CONFLICT(period, period_key) DO UPDATE SET
           md_path = excluded.md_path,
           content_md = excluded.content_md,
           created_at = excluded.created_at`,
      )
      .run({
        period,
        period_key: periodKey,
        md_path: mdPath,
        content_md: markdown,
        created_at: Date.now(),
      });
  }

  return { period, periodKey, itemCount: items.length, markdown, mdPath };
}
