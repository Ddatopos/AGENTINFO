import { config } from './config.js';
import { db } from './db/index.js';
import { SOURCES, findSource } from './sources/registry.js';
import { dueSources, fetchMany, fetchSource, syncSources } from './pipeline/fetch.js';
import { enrichPending } from './pipeline/enrich.js';
import { buildBriefing, type Period } from './pipeline/briefing.js';
import { recomputeScores } from './pipeline/rank.js';
import { hasAdapter } from './adapters/index.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function cmdFetch(): Promise<void> {
  const conn = db();
  syncSources(conn);

  const dryRun = flag('dry-run');
  const only = arg('source');
  const tier = arg('tier') as 'A' | 'B' | 'C' | undefined;

  let targets = SOURCES.filter((s) => hasAdapter(s.kind));

  if (only) {
    const src = findSource(only);
    if (!src) {
      console.error(`未找到数据源: ${only}`);
      console.error(`可用: ${SOURCES.map((s) => s.id).join(', ')}`);
      process.exit(1);
    }
    targets = [src];
  } else if (tier) {
    targets = targets.filter((s) => s.tier === tier);
  } else if (flag('due')) {
    targets = dueSources(conn).filter((s) => hasAdapter(s.kind));
  }

  if (targets.length === 0) {
    console.log('没有需要抓取的源');
    return;
  }

  console.log(`开始抓取 ${targets.length} 个源${dryRun ? '（dry-run，不写库）' : ''}`);

  // dry-run 单源时打印归一化结果，便于确认适配器解析正确
  if (dryRun && targets.length === 1) {
    const src = targets[0]!;
    const result = await fetchSource(src, { dryRun: true, conn });
    console.log(`\n[${src.id}] ${result.ok ? '成功' : '失败'} 用时 ${fmt(result.durationMs)}`);
    if (result.error) console.error(`  错误: ${result.error}`);
    console.log(`  解析到 ${result.received} 条`);
    return;
  }

  const results = await fetchMany(targets, { dryRun });

  let inserted = 0;
  let failed = 0;
  for (const r of results) {
    const tag = r.ok ? (r.notModified ? '304' : '✓') : '✗';
    console.log(
      `  ${tag} ${r.sourceId.padEnd(22)} 新增 ${String(r.inserted).padStart(3)} / 收到 ${String(r.received).padStart(3)}  ${fmt(r.durationMs)}${r.error ? `  ${r.error}` : ''}`,
    );
    inserted += r.inserted;
    if (!r.ok) failed++;
  }

  if (!dryRun) {
    const stats = recomputeScores(conn);
    console.log(`\n合计新增 ${inserted} 条，失败 ${failed} 个源，已重算 ${stats.scored} 条热度`);
  }
}

async function cmdRank(): Promise<void> {
  const stats = recomputeScores(db());
  console.log(`已重算 ${stats.scored} 条热度，剔除噪音 ${stats.skippedNoise} 条`);
}

async function cmdEnrich(): Promise<void> {
  const conn = db();
  const limit = Number(arg('limit')) || config.llm.maxItemsPerRun;

  console.log(
    config.llm.enabled
      ? `加工中：规则打分全量 + LLM 摘要最多 ${limit} 条（${config.llm.model}）`
      : '未配置 LLM_API_KEY，只跑关键词规则打分',
  );

  const rescore = flag('rescore');
  if (rescore) console.log('  --rescore：对全库重跑规则打分（不覆盖已有 LLM 结果）');

  const stats = await enrichPending(conn, { limit, force: flag('force'), rescore });
  const rank = recomputeScores(conn);

  console.log(`  规则打分 ${stats.ruleScored} 条（待处理 ${stats.scanned}）`);
  if (config.llm.enabled) {
    console.log(`  LLM 摘要 ${stats.llmEnriched} 条，失败 ${stats.llmFailed} 条`);
    console.log(`  token 用量：输入 ${stats.tokensIn} / 输出 ${stats.tokensOut}`);
  }
  console.log(`  已重算 ${rank.scored} 条热度，剔除噪音 ${rank.skippedNoise} 条`);
}

async function cmdBriefing(): Promise<void> {
  const period = (arg('period') as Period | undefined) ?? 'daily';
  if (period !== 'daily' && period !== 'weekly') {
    console.error(`--period 只支持 daily | weekly，收到: ${period}`);
    process.exit(1);
  }

  const limit = Number(arg('limit')) || undefined;
  const result = buildBriefing(db(), { period, limit, write: !flag('stdout') });

  if (flag('stdout')) {
    console.log(result.markdown);
    return;
  }

  console.log(`已生成${period === 'daily' ? '日报' : '周报'} ${result.periodKey}，共 ${result.itemCount} 条`);
  if (result.mdPath) console.log(`  ${result.mdPath}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'fetch':
      await cmdFetch();
      break;
    case 'rank':
      await cmdRank();
      break;
    case 'enrich':
      await cmdEnrich();
      break;
    case 'briefing':
      await cmdBriefing();
      break;
    default:
      console.log(`用法:
  npm run fetch                      抓取全部已实现的源
  npm run fetch -- --due             只抓到期的源（按 tier 间隔）
  npm run fetch -- --tier=A          只抓某一档
  npm run fetch -- --source=hn       只抓单个源
  npm run fetch -- --source=hn --dry-run   只解析不写库，调试用
  npm run enrich                     规则打分 + LLM 摘要（未配 key 时只跑规则）
  npm run enrich -- --limit=20       限制本轮 LLM 条数，控成本
  npm run enrich -- --force          已有摘要也重新生成
  npm run enrich -- --rescore        改了 keywords.ts 后全库重跑规则分
  npm run rank                       重算热度分
  npm run briefing                   生成今日日报（写入 data/briefings/）
  npm run briefing -- --period=weekly  生成本周周报
  npm run briefing -- --stdout       只打印不写文件
  npm run migrate                    建库并打印各表行数
  npm run migrate -- --rebuild-fts   重建全文索引`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
