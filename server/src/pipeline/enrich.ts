import type { Database } from 'better-sqlite3';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { enrichWithLlm } from '../lib/llm.js';
import { truncate } from '../lib/text.js';
import { ruleScore } from './keywords.js';
import { syncFtsSummary } from './ingest.js';

/**
 * 加工阶段：给条目打 relevance / category / tags，并生成中文摘要。
 *
 * 两条路径：
 *   ① 规则打分（keywords.ts）—— 零成本，覆盖全部条目，先跑一遍定出优先级
 *   ② LLM 摘要 —— 只给规则分过线的条目做，控制 token 花销
 *
 * 未配置 LLM_API_KEY 时只跑 ①，系统功能完整，摘要留空由前端回落到正文摘录。
 */

interface PendingRow {
  id: number;
  title: string;
  raw_text: string | null;
  source_name: string;
}

export interface EnrichStats {
  scanned: number;
  ruleScored: number;
  llmEnriched: number;
  llmFailed: number;
  skippedLowScore: number;
  tokensIn: number;
  tokensOut: number;
}

const UPSERT = `
INSERT INTO enrichments
  (item_id, summary_zh, tags_json, category, relevance, is_noise, model,
   prompt_version, tokens_in, tokens_out, failed, created_at)
VALUES
  (@item_id, @summary_zh, @tags_json, @category, @relevance, @is_noise, @model,
   @prompt_version, @tokens_in, @tokens_out, @failed, @created_at)
ON CONFLICT(item_id) DO UPDATE SET
  summary_zh = excluded.summary_zh,
  tags_json  = excluded.tags_json,
  category   = excluded.category,
  relevance  = excluded.relevance,
  is_noise   = excluded.is_noise,
  model      = excluded.model,
  prompt_version = excluded.prompt_version,
  tokens_in  = excluded.tokens_in,
  tokens_out = excluded.tokens_out,
  failed     = excluded.failed,
  created_at = excluded.created_at
`;

/**
 * 规则打分专用的 upsert。
 *
 * 比通用 UPSERT 多一个 WHERE：只覆盖规则打分过的行（model = 'rule'）。
 * 因为规则分是降级方案，LLM 的判断质量更高 —— 改了关键词规则后全量重跑时，
 * 不能把已有的 LLM 摘要和分类冲掉（UPSERT 里 summary_zh 传的是 null）。
 */
const RULE_UPSERT = `${UPSERT}
WHERE enrichments.model = 'rule' OR enrichments.model IS NULL`;

/**
 * 选出待加工条目：还没有 enrichment 记录的，或上次失败的，
 * 或 prompt 版本已升级的（改了 prompt 就该重跑）。
 * 按时间倒序，新内容优先。
 */
function pending(conn: Database, limit: number, all = false): PendingRow[] {
  // all=true 时不看 enrichment 状态，全库重跑（改了关键词规则后需要）
  const where = all
    ? ''
    : `WHERE e.item_id IS NULL
          OR e.failed = 1
          OR e.prompt_version < @version`;

  return conn
    .prepare(
      `SELECT i.id, i.title, i.raw_text, s.name AS source_name
         FROM items i
         JOIN sources s ON s.id = i.source_id
         LEFT JOIN enrichments e ON e.item_id = i.id
        ${where}
        ORDER BY COALESCE(i.published_at, i.ingested_at) DESC
        LIMIT @limit`,
    )
    .all({ version: config.llm.promptVersion, limit }) as PendingRow[];
}

/**
 * 只跑规则打分，不调 LLM。零成本，可以对全库反复跑。
 * rescore=true 时重算全部条目 —— 改了 keywords.ts 的规则后用它刷新历史数据。
 */
export function ruleEnrichAll(
  conn: Database = db(),
  opts: { rescore?: boolean } = {},
): EnrichStats {
  const stats = blankStats();
  const rows = pending(conn, Number.MAX_SAFE_INTEGER, opts.rescore);
  stats.scanned = rows.length;

  const upsert = conn.prepare(RULE_UPSERT);
  const now = Date.now();

  const tx = conn.transaction(() => {
    for (const row of rows) {
      const score = ruleScore(row.title, row.raw_text ?? '');
      upsert.run({
        item_id: row.id,
        summary_zh: null,
        tags_json: JSON.stringify(score.tags),
        category: score.category,
        relevance: score.relevance,
        is_noise: score.isNoise ? 1 : 0,
        model: 'rule',
        prompt_version: config.llm.promptVersion,
        tokens_in: 0,
        tokens_out: 0,
        failed: 0,
        created_at: now,
      });
      stats.ruleScored++;
    }
  });

  tx();
  return stats;
}

/**
 * 完整加工：先规则打分兜底，再对高分条目调 LLM 衡摘要。
 * LLM 单条失败只标记该条 failed，不影响其余条目 —— 下一轮自动重试。
 * 失败次数超过阈值（3次）后放弃重试，避免永久性错误无限重试。
 */
export async function enrichPending(
  conn: Database = db(),
  opts: { limit?: number; force?: boolean; rescore?: boolean } = {},
): Promise<EnrichStats> {
  const limit = opts.limit ?? config.llm.maxItemsPerRun;
  const stats = blankStats();

  // 第一步：规则打分覆盖全部待处理条目，保证任何情况下都有分可排
  const ruleStats = ruleEnrichAll(conn, { rescore: opts.rescore });
  stats.scanned = ruleStats.scanned;
  stats.ruleScored = ruleStats.ruleScored;

  if (!config.llm.enabled) return stats;

  // 第二步：挑规则分过线且还没有摘要的，调 LLM
  // 失败次数 < 3 的才重试，超过阈值视为永久性错误，放弃
  const targets = conn
    .prepare(
      `SELECT i.id, i.title, i.raw_text, s.name AS source_name
         FROM items i
         JOIN sources s ON s.id = i.source_id
         JOIN enrichments e ON e.item_id = i.id
        WHERE e.is_noise = 0
          AND (@force = 1 OR e.summary_zh IS NULL)
          AND e.relevance >= @threshold
          AND e.failed < 3
        ORDER BY e.relevance DESC, COALESCE(i.published_at, i.ingested_at) DESC
        LIMIT @limit`,
    )
    .all({
      threshold: config.llm.relevanceThreshold,
      limit,
      force: opts.force ? 1 : 0,
    }) as PendingRow[];

  const upsert = conn.prepare(UPSERT);
  const markFailed = conn.prepare(`UPDATE enrichments SET failed = failed + 1 WHERE item_id = ?`);

  for (const row of targets) {
    try {
      const result = await enrichWithLlm(row.title, row.raw_text ?? '', row.source_name);
      const p = result.payload;

      upsert.run({
        item_id: row.id,
        summary_zh: truncate(p.summary_zh, 400),
        tags_json: JSON.stringify(p.tags.slice(0, 8)),
        category: p.category,
        relevance: p.relevance,
        is_noise: p.is_noise ? 1 : 0,
        model: result.model,
        prompt_version: config.llm.promptVersion,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        failed: 0,
        created_at: Date.now(),
      });

      // 摘要进 FTS，让搜索能命中 LLM 产出的中文内容
      syncFtsSummary(conn, row.id, p.summary_zh);

      stats.llmEnriched++;
      stats.tokensIn += result.tokensIn;
      stats.tokensOut += result.tokensOut;
    } catch (err) {
      // 保留规则分，增加失败计数，超过 3 次后不再重试
      markFailed.run(row.id);
      stats.llmFailed++;
      console.error(
        `[enrich] 条目 ${row.id} 加工失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return stats;
}

function blankStats(): EnrichStats {
  return {
    scanned: 0,
    ruleScored: 0,
    llmEnriched: 0,
    llmFailed: 0,
    skippedLowScore: 0,
    tokensIn: 0,
    tokensOut: 0,
  };
}
