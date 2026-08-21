import crypto from 'node:crypto';

const TRACKING_PARAM = /^(utm_|ref$|ref_|from$|source$|spm$|share_|fbclid$|gclid$)/i;

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * URL 规范化：去追踪参数与 fragment、统一小写 host、去末尾斜杠。
 * 目的是让同一篇文章的不同分享链接落到同一个 dedupe_key。
 */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    if (u.protocol === 'http:') u.protocol = 'https:';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    let out = u.toString();
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return raw.trim();
  }
}

/** 标题归一化：去标点空格、全角转半角、小写。用于跨源转载判重。 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

const CJK = /[㐀-䶿一-鿿぀-ヿ]/;

export function detectLang(text: string): 'zh' | 'en' {
  const cjkCount = [...text].filter((ch) => CJK.test(ch)).length;
  return cjkCount / Math.max(text.length, 1) > 0.15 ? 'zh' : 'en';
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });

/**
 * 中文预分词，产出空格分隔的词串写入 items_fts.seg。
 * FTS5 默认分词器不切中文，本机无 jieba 原生依赖，用 Node 自带 Intl.Segmenter 解决。
 * 实测：人工智能代理系统 -> 人工 智能 代理 系统
 */
export function segment(text: string): string {
  if (!text) return '';
  const words: string[] = [];
  for (const s of segmenter.segment(text)) {
    if (s.isWordLike) words.push(s.segment.toLowerCase());
  }
  return words.join(' ');
}

/** 去 HTML 标签，供摘要与全文检索使用。 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
