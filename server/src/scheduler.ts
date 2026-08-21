import cron from 'node-cron';
import { config } from './config.js';
import { db } from './db/index.js';
import { dueSources, fetchMany } from './pipeline/fetch.js';
import { enrichPending } from './pipeline/enrich.js';
import { buildBriefing } from './pipeline/briefing.js';
import { recomputeScores } from './pipeline/rank.js';
import { hasAdapter } from './adapters/index.js';

/**
 * 后台调度。
 *
 * 关键设计：cron 只负责"敲钟"，到底抓哪些源由 dueSources() 按 last_fetch_at 判断。
 * 本机是台会休眠的开发机，cron 在休眠期间不会补触发 —— 如果按 tier 各配一条
 * cron 表达式，睡一晚起来就少抓一轮。所以统一每 15 分钟 tick 一次，
 * 每次都问"谁到期了"，睡眠期间错过的轮次自然会在下次 tick 补上（catch-up）。
 *
 * 另外用 running 标志防重入：抓取慢于 tick 间隔时，宁可跳过这一轮，
 * 也不要两轮并发写同一个库。
 */

let running = false;

export interface TickResult {
  fetched: number;
  inserted: number;
  refreshed: number;
  failed: number;
  enriched: number;
}

/** 跑一轮完整流水线：抓取到期源 -> 加工 -> 重算热度。 */
export async function runOnce(): Promise<TickResult> {
  const result: TickResult = { fetched: 0, inserted: 0, refreshed: 0, failed: 0, enriched: 0 };

  const conn = db();
  const targets = dueSources(conn).filter((s) => hasAdapter(s.kind));

  if (targets.length > 0) {
    const runs = await fetchMany(targets);
    result.fetched = runs.length;
    for (const run of runs) {
      result.inserted += run.inserted;
      result.refreshed += run.refreshed;
      if (!run.ok) result.failed++;
    }

    const failedIds = runs.filter((r) => !r.ok).map((r) => r.sourceId);
    console.log(
      `[cron] 抓取 ${runs.length} 源：新增 ${result.inserted} 条，刷新 ${result.refreshed} 条` +
        (result.failed ? `，失败 ${result.failed} 个（${failedIds.join(', ')}）` : ''),
    );
  }

  // 即使这轮没抓到新内容也跑一次加工：上一轮 LLM 失败的条目需要重试
  const enrich = await enrichPending(conn);
  result.enriched = enrich.llmEnriched;

  if (enrich.ruleScored > 0 || enrich.llmEnriched > 0) {
    console.log(
      `[cron] 加工：规则 ${enrich.ruleScored} 条` +
        (config.llm.enabled ? `，LLM 摘要 ${enrich.llmEnriched} 条，失败 ${enrich.llmFailed} 条` : ''),
    );
  }

  recomputeScores(conn);
  return result;
}

/**
 * 启动调度器。返回停止函数，便于测试或优雅关停。
 * 进程刚起来时先跑一轮：容器重启后不用干等 15 分钟。
 */
export function startScheduler(): () => void {
  const tasks: cron.ScheduledTask[] = [];

  const tick = async (label: string): Promise<void> => {
    if (running) {
      console.log(`[cron] ${label}：上一轮仍在进行，跳过`);
      return;
    }
    running = true;
    try {
      await runOnce();
    } catch (err) {
      // 调度器绝不能因为一轮失败就死掉
      console.error(`[cron] ${label} 出错:`, err instanceof Error ? err.message : String(err));
    } finally {
      running = false;
    }
  };

  // 每 15 分钟一次，靠 dueSources 决定实际抓谁
  tasks.push(cron.schedule('*/15 * * * *', () => void tick('定时轮次')));

  // 每天 09:05 生成日报；周一 09:10 再出一份上周周报
  tasks.push(
    cron.schedule('5 9 * * *', () => {
      try {
        const brief = buildBriefing(db(), { period: 'daily' });
        console.log(`[cron] 日报 ${brief.periodKey} 已生成，${brief.itemCount} 条`);
      } catch (err) {
        console.error('[cron] 日报生成失败:', err instanceof Error ? err.message : String(err));
      }
    }),
  );

  tasks.push(
    cron.schedule('10 9 * * 1', () => {
      try {
        const brief = buildBriefing(db(), { period: 'weekly' });
        console.log(`[cron] 周报 ${brief.periodKey} 已生成，${brief.itemCount} 条`);
      } catch (err) {
        console.error('[cron] 周报生成失败:', err instanceof Error ? err.message : String(err));
      }
    }),
  );

  console.log('[cron] 调度已启动：每 15 分钟检查到期源，每日 09:05 出日报');

  // 启动即跑一轮，但不阻塞 listen
  void tick('启动首轮');

  return () => {
    for (const task of tasks) task.stop();
    console.log('[cron] 调度已停止');
  };
}
