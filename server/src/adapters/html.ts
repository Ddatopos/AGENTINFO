import type { Adapter, FetchContext, FetchResult, NormalizedItem, SourceConfig } from './types.js';
import { stripHtml, truncate } from '../lib/text.js';

/**
 * 通用 HTML 抓取器 —— 给没有 RSS 的站点用（目前是 Anthropic News）。
 *
 * 选择器全部放在 registry 的 selectors 里，站点改版时只改配置不改代码。
 * 'self' 表示取 item 元素自身（常见于整块是一个 <a> 的卡片布局）。
 *
 * 重要约束：只用语义化选择器（h2/h3/h4、time、p），不要用 class。
 * 现代站点普遍上 CSS Modules，class 里带构建哈希
 * （如 FeaturedGrid-module-scss-module__W1FydW__content），
 * 每次发版都会变，用它做选择器等于埋定时炸弹。
 */

/** 折叠空白并去首尾空格。HTML 里的换行缩进会带进文本，统一清一遍。 */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export const htmlAdapter: Adapter = {
  kind: 'html',

  async fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult> {
    const sel = src.selectors;
    if (!sel) throw new Error(`html 源缺少 selectors 配置: ${src.id}`);

    const headers: Record<string, string> = { Accept: 'text/html,application/xhtml+xml' };
    if (ctx.etag) headers['If-None-Match'] = ctx.etag;
    if (ctx.lastModified) headers['If-Modified-Since'] = ctx.lastModified;

    const res = await ctx.http(src.url, { headers });

    if (res.status === 304) return { items: [], notModified: true, httpStatus: 304 };
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const { load } = await import('cheerio');
    const $ = load(await res.text());

    const seen = new Set<string>();
    const items: NormalizedItem[] = [];

    $(sel.item).each((_, el) => {
      const node = $(el);

      // 链接：'self' 时 item 本身就是 <a>
      const rawHref = sel.link === 'self' ? node.attr('href') : node.find(sel.link).first().attr('href');
      if (!rawHref) return;

      // 相对路径按页面 URL 补全
      let href: string;
      try {
        href = new URL(rawHref, src.url).toString();
      } catch {
        return;
      }
      if (seen.has(href)) return;

      /**
       * 同一个页面往往混着两种卡片布局（Anthropic News 实测）：
       *   ① 特色卡：标题在 <h2>/<h4> 里
       *   ② 列表卡：没有标题标签，时间/分类/标题平铺成兄弟 <span>，标题是最后一个
       * 所以标题按 配置选择器 → 语义标题标签 → 最后一个 span → 自身文本 逐级回落。
       * 取 span 的"自身直接文本"而非后代文本，避免把日期和分类串进标题。
       */
      let firstSpan = '';
      let lastSpan = '';
      node.find('span').each((_i, sp) => {
        const text = clean($(sp).clone().children().remove().end().text());
        if (!text) return;
        if (!firstSpan) firstSpan = text;
        lastSpan = text;
      });

      let title = sel.title === 'self' ? '' : clean(node.find(sel.title).first().text());
      if (!title) title = clean(node.find('h1, h2, h3, h4').first().text());
      if (!title) title = lastSpan;
      if (!title) title = clean(node.clone().children().remove().end().text());
      if (!title) return;

      // 时间：<time datetime> 属性最可靠，其次解析可见文本（"Jul 24, 2026"）
      const timeEl = node.find('time').first();
      const dtAttr = timeEl.attr('datetime');
      const parsed = Date.parse(dtAttr || timeEl.text().trim());

      const summary = sel.summary
        ? stripHtml(node.find(sel.summary).first().text()).trim()
        : '';

      seen.add(href);
      items.push({
        url: href,
        title: truncate(title, 300),
        rawText: truncate(summary, 4000) || undefined,
        publishedAt: Number.isFinite(parsed) ? parsed : undefined,
        // 分类是标题之前那个 span（"Product" / "Announcements"）。
        // 只有一个 span 时它就是标题本身，此时没有分类可用。
        raw: { href: rawHref, category: firstSpan && firstSpan !== title ? firstSpan : undefined },
      });
    });

    // 抓到 0 条基本等同选择器失效。这里只返回空，由 fetch.ts 统一抛错告警，
    // 保证已入库的旧数据不被清空。
    return {
      items,
      etag: res.headers.get('etag') ?? undefined,
      lastModified: res.headers.get('last-modified') ?? undefined,
      httpStatus: res.status,
    };
  },
};
