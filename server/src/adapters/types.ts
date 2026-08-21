/** 所有源归一到这个形状。新增源只需实现一个 Adapter 并在 registry 加一行。 */
export interface NormalizedItem {
  url?: string;
  title: string;
  author?: string;
  rawText?: string;
  publishedAt?: number;
  metrics?: Record<string, number>;
  raw?: unknown;
}

export type SourceKind =
  | 'rss'
  | 'github_search'
  | 'github_trending'
  | 'hn'
  | 'hf_models'
  | 'hf_papers'
  | 'html';

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  tier: 'A' | 'B' | 'C';
  /** 0..1，参与热度公式的源权威度 */
  authority: number;
  /** 每次请求前的最小间隔（毫秒），如 arXiv 要求 3s */
  minIntervalMs?: number;
  /** HTML 抓取器的选择器配置，放在配置里便于源改版时快速修 */
  selectors?: {
    item: string;
    title: string;
    link: string;
    summary?: string;
  };
  /** 附加到 URL 的查询参数（GitHub search 等） */
  query?: Record<string, string>;
}

export interface FetchResult {
  items: NormalizedItem[];
  etag?: string;
  lastModified?: string;
  notModified?: boolean;
  httpStatus?: number;
}

export interface FetchContext {
  etag?: string;
  lastModified?: string;
  /** 增量水位：早于此时间的条目可跳过 */
  since?: number;
  /** 已内置 UA、超时、限流、重试的 fetch */
  http: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface Adapter {
  kind: SourceKind;
  fetch(src: SourceConfig, ctx: FetchContext): Promise<FetchResult>;
}
