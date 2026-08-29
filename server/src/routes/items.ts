import { Router } from 'express';
import { db } from '../db/index.js';
import { segment } from '../lib/text.js';
import { getClient } from '../lib/llm.js';
import { config } from '../config.js';

export const itemsRouter = Router();

interface ItemRow {
  id: number;
  source_id: string;
  source_name: string;
  url: string | null;
  title: string;
  author: string | null;
  lang: string | null;
  published_at: number | null;
  ingested_at: number;
  metrics_json: string | null;
  summary_zh: string | null;
  tags_json: string | null;
  category: string | null;
  relevance: number | null;
  heat: number | null;
}

function shape(row: ItemRow) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    url: row.url,
    title: row.title,
    author: row.author,
    lang: row.lang,
    publishedAt: row.published_at,
    ingestedAt: row.ingested_at,
    metrics: row.metrics_json ? JSON.parse(row.metrics_json) : {},
    summaryZh: row.summary_zh,
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
    category: row.category,
    relevance: row.relevance,
    heat: row.heat,
  };
}

const SELECT_BASE = `
  SELECT i.id, i.source_id, s.name AS source_name, i.url, i.title, i.author, i.lang,
         i.published_at, i.ingested_at, i.metrics_json,
         e.summary_zh, e.tags_json, e.category, e.relevance,
         sc.heat
    FROM items i
    JOIN sources s ON s.id = i.source_id
    LEFT JOIN enrichments e ON e.item_id = i.id
    LEFT JOIN scores sc ON sc.item_id = i.id
`;

/**
 * GET /api/items
 * 支持筛选：source / category / tag / lang / minScore / since，排序 heat|time
 */
itemsRouter.get('/', (req, res) => {
  const conn = db();
  const {
    source,
    category,
    lang,
    q,
    sort = 'heat',
    minScore,
    days,
  } = req.query as Record<string, string | undefined>;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (source) {
    where.push(`i.source_id = @source`);
    params.source = source;
  }
  if (category) {
    where.push(`e.category = @category`);
    params.category = category;
  }
  if (lang) {
    where.push(`i.lang = @lang`);
    params.lang = lang;
  }
  if (minScore) {
    where.push(`COALESCE(e.relevance, 50) >= @minScore`);
    params.minScore = Number(minScore);
  }
  if (days) {
    where.push(`COALESCE(i.published_at, i.ingested_at) >= @after`);
    params.after = Date.now() - Number(days) * 86_400_000;
  }
  // 默认隐藏噪音条目
  where.push(`COALESCE(e.is_noise, 0) = 0`);

  // 全文检索走 FTS5：中文查询先分词，与入库时的 seg 列对齐
  if (q && q.trim()) {
    const terms = segment(q) || q.trim();
    // FTS5 查询参数严格校验：移除所有特殊字符，只保留字母、数字、中文
    const safeTerms = terms
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);
    if (safeTerms.length > 0) {
      const match = safeTerms.map((t) => `"${t}"`).join(' OR ');
      where.push(`i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH @match)`);
      params.match = match;
    }
  }

  // SQL 注入防护：orderBy 白名单校验
  const orderBy =
    sort === 'time'
      ? `COALESCE(i.published_at, i.ingested_at) DESC`
      : `COALESCE(sc.heat, 0) DESC, COALESCE(i.published_at, i.ingested_at) DESC`;

  const sql = `${SELECT_BASE}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset`;

  const rows = conn.prepare(sql).all({ ...params, limit, offset }) as ItemRow[];

  const countSql = `SELECT COUNT(*) as total FROM items i
    JOIN sources s ON s.id = i.source_id
    LEFT JOIN enrichments e ON e.item_id = i.id
    LEFT JOIN scores sc ON sc.item_id = i.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const { match: _match, ...countParams } = params as Record<string, unknown>;
  let total = 0;
  try {
    total = (conn.prepare(countSql).get(countParams) as { total: number }).total ?? 0;
  } catch (err) {
    console.error('[items] count 查询失败:', err instanceof Error ? err.message : String(err));
    total = rows.length > 0 ? (offset ?? 0) + rows.length : 0;
  }

  res.json({ items: rows.map(shape), total, limit, offset });
});

itemsRouter.get('/:id/explain', async (req, res) => {
  const id = Number(req.params.id);
  const mode = (req.query.mode as string) === 'translate' ? 'translate' : 'explain';

  const row = db()
    .prepare(`${SELECT_BASE} WHERE i.id = @id`)
    .get({ id }) as ItemRow | undefined;

  if (!row) {
    res.status(404).json({ error: '未找到该条目' });
    return;
  }

  const api = getClient();
  if (!api) {
    res.status(503).json({ error: 'LLM 服务未配置' });
    return;
  }

  const title = row.title;
  const sourceName = row.source_name;
  const summaryZh = row.summary_zh;

  const systemPrompt =
    mode === 'translate'
      ? '你是翻译专家。请用中文回答。\n要求：不要使用 markdown 格式符号（如 **粗体**、- 列表、## 标题等），使用自然的文本格式，用换行或数字序号组织内容，简洁明了。'
      : '你是 AI 领域的智能助手。请用中文回答。\n要求：不要使用 markdown 格式符号（如 **粗体**、- 列表、## 标题等），使用自然的文本格式，用换行或数字序号组织内容，简洁明了，2-3 句话即可。';

  const userPrompt = `标题：${title}\n来源：${sourceName}\n${summaryZh ? `摘要：${summaryZh}` : '（无摘要）'}\n\n${mode === 'translate' ? '请用中文简要说明这条资讯的核心内容。' : '请用 2-3 句话解释这条资讯的核心内容，以及为什么值得关注。'}\n\n要求：不要使用 markdown 符号，用自然文本格式回答。`;

  try {
    const response = await api.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      res.status(500).json({ error: '模型返回空内容' });
      return;
    }

    res.json({ text: content });
  } catch (err) {
    console.error(`[items] explain 失败 (id=${id}, mode=${mode}):`, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: '生成解释失败' });
  }
});

/** GET /api/items/:id */
itemsRouter.get('/:id', (req, res) => {
  const row = db()
    .prepare(`${SELECT_BASE} WHERE i.id = @id`)
    .get({ id: Number(req.params.id) }) as ItemRow | undefined;

  if (!row) {
    res.status(404).json({ error: '未找到该条目' });
    return;
  }
  res.json(shape(row));
});
