import { config } from '../config.js';
import { db } from '../db/index.js';
import { segment } from './text.js';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface SearchInternalOptions {
  query: string;
  days?: number;
  limit?: number;
}

export async function searchInternal({ query, days = 7, limit = 10 }: SearchInternalOptions): Promise<string> {
  const conn = db();
  const terms = segment(query) || query.trim();
  const safeTerms = terms
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  let items: Array<{ title: string; source_name: string; summary_zh: string | null; published_at: number | null }> = [];

  if (safeTerms.length > 0) {
    const match = safeTerms.map((t) => `"${t}"`).join(' OR ');
    const after = Date.now() - days * 86_400_000;
    items = conn
      .prepare(
        `SELECT i.title, s.name AS source_name, e.summary_zh, i.published_at
           FROM items i
           JOIN sources s ON s.id = i.source_id
           LEFT JOIN enrichments e ON e.item_id = i.id
          WHERE i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH @match)
            AND COALESCE(i.published_at, i.ingested_at) >= @after
            AND COALESCE(e.is_noise, 0) = 0
          ORDER BY COALESCE(i.published_at, i.ingested_at) DESC
          LIMIT @limit`,
      )
      .all({ match, after, limit }) as Array<{ title: string; source_name: string; summary_zh: string | null; published_at: number | null }>;
  }

  if (items.length === 0) {
    const after = Date.now() - days * 86_400_000;
    items = conn
      .prepare(
        `SELECT i.title, s.name AS source_name, e.summary_zh, i.published_at
           FROM items i
           JOIN sources s ON s.id = i.source_id
           LEFT JOIN enrichments e ON e.item_id = i.id
          WHERE COALESCE(i.published_at, i.ingested_at) >= @after
            AND COALESCE(e.is_noise, 0) = 0
          ORDER BY COALESCE(i.published_at, i.ingested_at) DESC
          LIMIT @limit`,
      )
      .all({ after, limit }) as Array<{ title: string; source_name: string; summary_zh: string | null; published_at: number | null }>;
  }

  if (items.length === 0) return '（数据库暂无相关数据）';

  return items
    .map(
      (item, i) =>
        `[${i + 1}] 标题：${item.title}\n    来源：${item.source_name}\n    摘要：${item.summary_zh || '（无摘要）'}`,
    )
    .join('\n\n');
}

export async function searchExternal(query: string): Promise<string> {
  if (!config.tavily.enabled) {
    return '（联网搜索未配置，跳过）';
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: config.tavily.apiKey,
        query: `AI Agent ${query} 最新进展 2025`,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
      }),
    });

    if (!res.ok) {
      console.error(`[searchTools] Tavily HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      return '（联网搜索失败，跳过）';
    }

    const data = (await res.json()) as { results?: TavilyResult[] };
    const results = data.results ?? [];

    if (results.length === 0) return '（联网搜索无结果）';

    return results
      .map(
        (r, i) =>
          `[${i + 1}] 标题：${r.title}\n    来源：${r.url}\n    摘要：${r.content.slice(0, 200)}`,
      )
      .join('\n\n');
  } catch (err) {
    console.error('[searchTools] Tavily 异常:', err instanceof Error ? err.message : String(err));
    return '（联网搜索异常，跳过）';
  }
}

export async function getTrendingStats(days: number): Promise<string> {
  const conn = db();
  const after = Date.now() - days * 86_400_000;

  const categories = conn
    .prepare(
      `SELECT COALESCE(e.category, '未分类') AS category, COUNT(*) AS count
         FROM items i
         JOIN enrichments e ON e.item_id = i.id
        WHERE COALESCE(i.published_at, i.ingested_at) >= @after
          AND COALESCE(e.is_noise, 0) = 0
        GROUP BY category
        ORDER BY count DESC
        LIMIT 10`,
    )
    .all({ after }) as Array<{ category: string; count: number }>;

  const sources = conn
    .prepare(
      `SELECT s.name, COUNT(*) AS count
         FROM items i
         JOIN sources s ON s.id = i.source_id
         LEFT JOIN enrichments e ON e.item_id = i.id
        WHERE COALESCE(i.published_at, i.ingested_at) >= @after
          AND COALESCE(e.is_noise, 0) = 0
        GROUP BY s.name
        ORDER BY count DESC
        LIMIT 10`,
    )
    .all({ after }) as Array<{ name: string; count: number }>;

  const lines: string[] = [`最近 ${days} 天数据概览：`];
  lines.push('分类分布：');
  for (const c of categories) {
    lines.push(`  - ${c.category}: ${c.count} 条`);
  }
  lines.push('热门来源：');
  for (const s of sources) {
    lines.push(`  - ${s.name}: ${s.count} 条`);
  }
  return lines.join('\n');
}
