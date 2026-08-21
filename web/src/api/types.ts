export interface Item {
  id: number;
  sourceId: string;
  sourceName: string;
  url: string | null;
  title: string;
  author: string | null;
  lang: string | null;
  publishedAt: number | null;
  ingestedAt: number;
  metrics: Record<string, number>;
  summaryZh: string | null;
  tags: string[];
  category: string | null;
  relevance: number | null;
  heat: number | null;
}

export interface SourceStatus {
  id: string;
  name: string;
  kind: string;
  tier: string;
  authority: number;
  enabled: boolean;
  lastFetchAt: number | null;
  failStreak: number;
  itemCount: number;
  lastError: string | null;
}

export interface BriefingMeta {
  id: number;
  period: string;
  periodKey: string;
  mdPath: string | null;
  createdAt: number;
}

export interface BriefingDetail {
  period: string;
  periodKey: string;
  markdown: string;
  createdAt: number;
}

export interface Stats {
  items: number;
  enriched: number;
  activeSources: number;
  last24h: number;
  tokensUsed: number;
  avgRelevance: number;
  categories: { category: string; count: number }[];
}

export interface ItemResponse {
  items: Item[]
  total: number
  limit: number
  offset: number
}

export interface SourceRunResult {
  sourceId: string
  ok: boolean
  httpStatus?: number
  notModified?: boolean
  received: number
  inserted: number
  duplicate: number
  refreshed: number
  durationMs: number
  error?: string
}
