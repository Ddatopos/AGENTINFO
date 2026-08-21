import type { Adapter, FetchContext, FetchResult, NormalizedItem, SourceConfig } from './types.js';
import { truncate } from '../lib/text.js';

/**
 * Hacker News —— 走 Algolia 的 search_by_date 端点。
 *
 * 两个设计选择：
 * ① 按关键词分多次请求。Algolia 的 query 是全文相关性检索，不支持 OR 布尔语法，
 *    单条 query 覆盖不了 "AI agent / LLM / MCP" 这些并列主题，所以逐个关键词各打一次，
 *    再在本地按 objectID 去重。关键词写在 registry 的 query.keywords 里，逗号分隔。
 * ② 用 numericFilters 做服务端过滤：points 门槛滤掉零互动的水贴，
 *    created_at_i 结合 ctx.since 只取上次抓取之后的新帖，省流量也省去重开销。
 */

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
  story_text?: string | null;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

const DEFAULT_KEYWORDS = 'AI agent,LLM,MCP,RAG,fine-tuning,open source model';
const DEFAULT_MIN_POINTS = 5;
const DEFAULT_HITS = 40;

/** HN 讨论页永远存在；外链可能没有（Ask HN 之类），此时回落到讨论页。 */
function discussionUrl(id: string): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export const hnAdapter: Adapter = {
  kind: 'hn',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const keywords = (src.query?.keywords ?? DEFAULT_KEYWORDS)
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const minPoints = Number(src.query?.minPoints ?? DEFAULT_MIN_POINTS);
    const hitsPerPage = Number(src.query?.hitsPerPage ?? DEFAULT_HITS);

    // 增量水位留 1 小时重叠，避免边界上的帖子被漏掉
    const since = ctx.since ? Math.floor(ctx.since / 1000) - 3600 : undefined;

    const seen = new Set<string>();
    const items: NormalizedItem[] = [];
    const errors: string[] = [];

    for (const keyword of keywords) {
      const filters = [`points>=${minPoints}`];
      if (since) filters.push(`created_at_i>${since}`);

      const url = new URL(src.url);
      url.searchParams.set('query', keyword);
      url.searchParams.set('tags', 'story');
      url.searchParams.set('hitsPerPage', String(hitsPerPage));
      url.searchParams.set('numericFilters', filters.join(','));

      try {
        const res = await ctx.http(url.toString(), { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        const body = (await res.json()) as AlgoliaResponse;

        for (const hit of body.hits ?? []) {
          const title = (hit.title ?? '').trim();
          if (!title || seen.has(hit.objectID)) continue;
          seen.add(hit.objectID);

          items.push({
            url: hit.url ?? discussionUrl(hit.objectID),
            title,
            author: hit.author ?? undefined,
            rawText: truncate((hit.story_text ?? '').trim(), 4000) || undefined,
            publishedAt: hit.created_at_i * 1000,
            metrics: {
              points: hit.points ?? 0,
              comments: hit.num_comments ?? 0,
            },
            raw: { objectID: hit.objectID, keyword, discussion: discussionUrl(hit.objectID) },
          });
        }
      } catch (err) {
        // 单个关键词失败不该废掉整轮抓取，记下来最后统一判断
        errors.push(`${keyword}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 全部关键词都失败才算这个源失败，否则拿到多少算多少
    if (items.length === 0 && errors.length === keywords.length) {
      throw new Error(`全部关键词请求失败 —— ${errors.join('; ')}`);
    }

    return { items, httpStatus: 200 };
  },
};
