import type { Adapter, SourceKind } from './types.js';
import { rssAdapter } from './rss.js';
import { hnAdapter } from './hn.js';
import { githubSearchAdapter, githubTrendingAdapter } from './github.js';
import { hfModelsAdapter, hfPapersAdapter } from './huggingface.js';
import { htmlAdapter } from './html.js';

/**
 * 适配器注册表。7 种 kind 全部实现，registry 里的源不再有空转的。
 * 取不到对应 kind 时抛错，避免静默跳过一个源。
 */
const ALL: Adapter[] = [
  rssAdapter,
  hnAdapter,
  githubSearchAdapter,
  githubTrendingAdapter,
  hfPapersAdapter,
  hfModelsAdapter,
  htmlAdapter,
];

const REGISTRY = new Map<SourceKind, Adapter>(ALL.map((a) => [a.kind, a]));

export function register(adapter: Adapter): void {
  REGISTRY.set(adapter.kind, adapter);
}

export function getAdapter(kind: SourceKind): Adapter {
  const adapter = REGISTRY.get(kind);
  if (!adapter) throw new Error(`尚未实现该类型的适配器: ${kind}`);
  return adapter;
}

export function hasAdapter(kind: SourceKind): boolean {
  return REGISTRY.has(kind);
}
