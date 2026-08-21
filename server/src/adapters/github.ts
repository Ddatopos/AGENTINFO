import { config } from '../config.js';
import type { Adapter, FetchContext, FetchResult, NormalizedItem, SourceConfig } from './types.js';
import { truncate } from '../lib/text.js';

/**
 * GitHub 两个源共用一个文件：
 *   github_search   —— REST search API，找最近新建且已有一定星数的 AI 项目
 *   github_trending —— Trending 页面没有 API，只能抓 HTML
 *
 * PAT 是可选的：不带 token 时 search API 限 10 req/min，带了 30 req/min。
 * 未配置也能跑，只是节奏慢些。
 */

interface RepoItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string;
  topics?: string[];
  language: string | null;
  owner?: { login?: string } | null;
}

interface SearchResponse {
  items?: RepoItem[];
  message?: string;
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;
  return headers;
}

const DEFAULT_QUERIES = [
  'ai agent',
  'llm',
  'mcp server',
  'rag',
  'coding agent',
  'ai assistant',
  'language model',
  'deepseek',
  'cursor',
  'opencode',
  'windsurf',
  'aider',
  'ollama',
  'langchain',
  'transformer',
  'text-to-speech',
  'speech-to-text',
  'image-generation',
  'stable-diffusion',
].join(',');

export const githubSearchAdapter: Adapter = {
  kind: 'github_search',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const queries = (src.query?.queries ?? DEFAULT_QUERIES)
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);

    const minStars = Number(src.query?.minStars ?? 100);
    const createdWithinDays = Number(src.query?.createdWithinDays ?? 180);
    const perPage = Math.min(Number(src.query?.perPage ?? 50), 100);

    // 只看最近新建的仓库：老仓库的星数增长不代表"新热点"
    const createdAfter = new Date(Date.now() - createdWithinDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const seen = new Set<string>();
    const items: NormalizedItem[] = [];
    const errors: string[] = [];

    for (const keyword of queries) {
      const url = new URL(src.url);
      url.searchParams.set('q', `${keyword} stars:>=${minStars} created:>=${createdAfter}`);
      url.searchParams.set('sort', 'stars');
      url.searchParams.set('order', 'desc');
      url.searchParams.set('per_page', String(perPage));

      try {
        const res = await ctx.http(url.toString(), { headers: ghHeaders() });

        // 限流时 GitHub 返回 403 且带 x-ratelimit-remaining: 0，区别于真正的权限错误
        if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
          throw new Error('触发 GitHub 限流，配置 GITHUB_TOKEN 可提升到 30 req/min');
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        const body = (await res.json()) as SearchResponse;
        if (body.message) throw new Error(body.message);

        for (const repo of body.items ?? []) {
          if (seen.has(repo.full_name)) continue;
          seen.add(repo.full_name);

          const topics = repo.topics ?? [];
          const description = (repo.description ?? '').trim();

          items.push({
            url: repo.html_url,
            // 标题带上描述，让后续 LLM/规则打分有足够上下文
            title: description ? `${repo.full_name} —— ${truncate(description, 120)}` : repo.full_name,
            author: repo.owner?.login ?? repo.full_name.split('/')[0],
            rawText: truncate(
              [description, topics.length ? `topics: ${topics.join(', ')}` : '', repo.language ? `language: ${repo.language}` : '']
                .filter(Boolean)
                .join('\n'),
              4000,
            ) || undefined,
            publishedAt: Date.parse(repo.created_at) || undefined,
            metrics: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              issues: repo.open_issues_count,
            },
            raw: { fullName: repo.full_name, topics, language: repo.language, pushedAt: repo.pushed_at, keyword },
          });
        }
      } catch (err) {
        errors.push(`${keyword}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (items.length === 0 && errors.length === queries.length) {
      throw new Error(`全部查询失败 —— ${errors.join('; ')}`);
    }

    return { items, httpStatus: 200 };
  },
};

/**
 * Trending 页面结构（2026-08 实测）：
 *   article.Box-row
 *     h2 a[href="/owner/repo"]         仓库名
 *     p                                描述
 *     [itemprop=programmingLanguage]   语言
 *     a[href$="/stargazers"]           总星数
 *     span.float-sm-right              "340 stars today"
 *
 * 没有发布时间可用，publishedAt 留空，交给 ingest 用 ingested_at 兜底。
 * stars_delta（当日新增）比总星数更能代表"现在热"，rank.ts 里优先取它。
 */
export const githubTrendingAdapter: Adapter = {
  kind: 'github_trending',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const { load } = await import('cheerio');

    const res = await ctx.http(src.url, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const $ = load(await res.text());
    const items: NormalizedItem[] = [];

    $('article.Box-row').each((_, el) => {
      const row = $(el);
      const href = row.find('h2 a').attr('href');
      if (!href) return;

      const fullName = href.replace(/^\//, '');
      const description = row.find('p').first().text().trim();
      const language = row.find('[itemprop=programmingLanguage]').text().trim();
      const stars = digits(row.find('a[href$="/stargazers"]').text());
      const forks = digits(row.find('a[href$="/forks"]').text());
      const todayText = row.find('span.float-sm-right').text();

      items.push({
        url: `https://github.com${href}`,
        title: description ? `${fullName} —— ${truncate(description, 120)}` : fullName,
        author: fullName.split('/')[0],
        rawText: truncate([description, language ? `language: ${language}` : ''].filter(Boolean).join('\n'), 4000) || undefined,
        // Trending 页面没有发布时间。留空会退化成 ingested_at，
        // 让"两年前建的老仓库"在时间衰减里表现成 0.6 小时前刚发布，
        // 直接霸榜。用当日零点作为快照时间：语义上就是"今天上榜"，
        // 且同一天内多次抓取得到同一个值，不会每次刷新都变新。
        publishedAt: startOfUtcDay(),
        metrics: {
          stars,
          forks,
          stars_delta: digits(todayText),
        },
        raw: { fullName, language, today: todayText.replace(/\s+/g, ' ').trim() },
      });
    });

    // 抓到 0 条说明 GitHub 改版了选择器，报错而不是静默返回空
    if (items.length === 0) {
      throw new Error('Trending 页面未解析到任何仓库，选择器可能已失效');
    }

    return { items, httpStatus: res.status };
  },
};

/** "27,477" / "340 stars today" -> 27477 / 340 */
function digits(text: string): number {
  const match = text.replace(/,/g, '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/** 当日 UTC 零点。作为 Trending 快照的"发布时间"，同一天内稳定不变。 */
function startOfUtcDay(now = Date.now()): number {
  return Math.floor(now / 86_400_000) * 86_400_000;
}
