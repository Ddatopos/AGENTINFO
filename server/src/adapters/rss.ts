import Parser from 'rss-parser';
import type { Adapter, FetchContext, FetchResult, SourceConfig } from './types.js';
import { stripHtml, truncate } from '../lib/text.js';

const parser = new Parser({ timeout: 20_000 });

/**
 * 作者字段在不同 feed 里形态差异很大：Google AI 的 Atom 会解析成
 * { name: ['Awaneesh Verma'], ... } 这样的对象。直接塞给 SQLite 会报
 * "can only bind numbers, strings, bigints, buffers, and null"，所以统一压成字符串。
 */
function coerceAuthor(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const got = coerceAuthor(v);
      if (got) return got;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return coerceAuthor(obj.name ?? obj._ ?? obj.displayName);
  }
  return undefined;
}

/**
 * 通用 RSS/Atom 适配器。覆盖清单里绝大多数源。
 * 用 ETag / If-Modified-Since 条件请求，命中 304 直接短路，省带宽也省解析。
 */
export const rssAdapter: Adapter = {
  kind: 'rss',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const headers: Record<string, string> = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
    if (ctx.etag) headers['If-None-Match'] = ctx.etag;
    if (ctx.lastModified) headers['If-Modified-Since'] = ctx.lastModified;

    const res = await ctx.http(src.url, { headers });

    if (res.status === 304) {
      return { items: [], notModified: true, httpStatus: 304 };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const items = (feed.items ?? []).map((entry) => {
      const body = entry.contentSnippet ?? entry['content:encoded'] ?? entry.content ?? entry.summary ?? '';
      const publishedAt = entry.isoDate
        ? Date.parse(entry.isoDate)
        : entry.pubDate
          ? Date.parse(entry.pubDate)
          : undefined;

      return {
        url: entry.link ?? undefined,
        title: (entry.title ?? '').trim() || '(无标题)',
        author: coerceAuthor(entry.creator ?? entry.author ?? entry['dc:creator']),
        rawText: truncate(stripHtml(String(body)), 4000),
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
        raw: entry,
      };
    });

    return {
      items,
      etag: res.headers.get('etag') ?? undefined,
      lastModified: res.headers.get('last-modified') ?? undefined,
      httpStatus: res.status,
    };
  },
};
