import type { Adapter, FetchContext, FetchResult, NormalizedItem, SourceConfig } from './types.js';
import { truncate } from '../lib/text.js';

/**
 * HuggingFace 两个源：daily_papers 与 models 榜。
 * 两者都要求浏览器 UA（http.ts 已统一注入），否则返回 HTML 而不是 JSON。
 */

interface DailyPaperEntry {
  title?: string;
  publishedAt?: string;
  summary?: string;
  numComments?: number;
  submittedBy?: { name?: string; fullname?: string } | null;
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
    publishedAt?: string;
    githubRepo?: string | null;
    githubStars?: number | null;
    ai_keywords?: string[] | null;
    authors?: Array<{ name?: string }> | null;
  } | null;
}

/**
 * daily_papers 的字段在顶层和 paper 子对象里各有一份，且都可能缺失，
 * 所以逐个字段做 top ?? paper 的回落。arXiv 链接由 paper.id 拼出来。
 */
export const hfPapersAdapter: Adapter = {
  kind: 'hf_papers',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const limit = Number(src.query?.limit ?? 50);

    const url = new URL(src.url);
    url.searchParams.set('limit', String(limit));

    const res = await ctx.http(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const body = (await res.json()) as DailyPaperEntry[];
    if (!Array.isArray(body)) throw new Error('daily_papers 返回结构异常，期望数组');

    const items: NormalizedItem[] = [];

    for (const entry of body) {
      const paper = entry.paper ?? {};
      const title = (entry.title ?? paper.title ?? '').trim();
      if (!title) continue;

      const arxivId = paper.id;
      const summary = (entry.summary ?? paper.summary ?? '').trim();
      const authors = (paper.authors ?? []).map((a) => a?.name).filter(Boolean) as string[];
      const publishedAt = Date.parse(paper.publishedAt ?? entry.publishedAt ?? '');

      items.push({
        // 优先 HF 论文页（有讨论和上下文），没有 id 时退回 daily papers 首页
        url: arxivId ? `https://huggingface.co/papers/${arxivId}` : 'https://huggingface.co/papers',
        title,
        author: authors.slice(0, 3).join(', ') || entry.submittedBy?.fullname || undefined,
        rawText: truncate(summary, 4000) || undefined,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
        metrics: {
          upvotes: paper.upvotes ?? 0,
          comments: entry.numComments ?? 0,
          ...(typeof paper.githubStars === 'number' ? { stars: paper.githubStars } : {}),
        },
        raw: {
          arxivId,
          arxivUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
          githubRepo: paper.githubRepo ?? undefined,
          keywords: paper.ai_keywords ?? undefined,
          authorCount: authors.length,
        },
      });
    }

    return { items, httpStatus: res.status };
  },
};

interface ModelEntry {
  id: string;
  author?: string | null;
  likes?: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string | null;
  library_name?: string | null;
  tags?: string[];
  createdAt?: string;
  lastModified?: string;
}

/**
 * 模型榜按 trendingScore 排序。
 *
 * publishedAt 用 createdAt 而不是 lastModified：后者会因为一次 README 改动就刷新，
 * 让半年前的老模型在时间衰减里重新变"新"。
 */
export const hfModelsAdapter: Adapter = {
  kind: 'hf_models',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const limit = Number(src.query?.limit ?? 40);
    const sort = src.query?.sort ?? 'trendingScore';

    const url = new URL(src.url);
    url.searchParams.set('sort', sort);
    url.searchParams.set('direction', '-1');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('full', 'false');

    const res = await ctx.http(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const body = (await res.json()) as ModelEntry[];
    if (!Array.isArray(body)) throw new Error('models 返回结构异常，期望数组');

    const items: NormalizedItem[] = [];

    for (const model of body) {
      if (!model?.id) continue;

      // tags 里混着 license:/region:/endpoints_compatible 这类基础设施标记，过滤掉只留语义标签
      const tags = (model.tags ?? []).filter(
        (t) => !t.includes(':') && !['transformers', 'safetensors', 'endpoints_compatible', 'conversational'].includes(t),
      );
      const created = Date.parse(model.createdAt ?? '');

      const facts = [
        model.pipeline_tag ? `任务: ${model.pipeline_tag}` : '',
        model.library_name ? `框架: ${model.library_name}` : '',
        tags.length ? `标签: ${tags.slice(0, 8).join(', ')}` : '',
      ].filter(Boolean);

      items.push({
        url: `https://huggingface.co/${model.id}`,
        title: `${model.id}${model.pipeline_tag ? ` (${model.pipeline_tag})` : ''}`,
        author: model.author ?? model.id.split('/')[0],
        rawText: facts.join('\n') || undefined,
        publishedAt: Number.isFinite(created) ? created : undefined,
        metrics: {
          trendingScore: model.trendingScore ?? 0,
          likes: model.likes ?? 0,
          downloads: model.downloads ?? 0,
        },
        raw: {
          modelId: model.id,
          pipelineTag: model.pipeline_tag ?? undefined,
          library: model.library_name ?? undefined,
          tags: tags.slice(0, 12),
          lastModified: model.lastModified,
        },
      });
    }

    return { items, httpStatus: res.status };
  },
};
