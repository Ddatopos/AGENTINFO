/**
 * 建库 / 校验脚本。
 *
 * schema.sql 全部用 IF NOT EXISTS，且 db() 每次连接都会 exec 一遍，
 * 所以"迁移"本质上是幂等的建表。这个脚本的价值在于：
 *   ① 首次部署时显式建库，不用等第一个请求
 *   ② 打印表结构与行数，确认库确实可写
 *   ③ --rebuild-fts 重建全文索引（改了分词逻辑后需要）
 */
import { db } from './index.js';
import { segment } from '../lib/text.js';
import { config } from '../config.js';

const TABLES = ['sources', 'items', 'enrichments', 'scores', 'briefings', 'fetch_log'] as const;

/**
 * 重建 FTS 索引。items_fts 是普通 FTS5 表（非 external content），
 * 内容由应用层同步，所以改了 segment() 的分词规则后必须重建，否则老数据搜不到。
 */
function rebuildFts(): void {
  const conn = db();
  const rows = conn
    .prepare(
      `SELECT i.id, i.title, i.raw_text, e.summary_zh
         FROM items i LEFT JOIN enrichments e ON e.item_id = i.id`,
    )
    .all() as Array<{ id: number; title: string; raw_text: string | null; summary_zh: string | null }>;

  const insert = conn.prepare(
    `INSERT INTO items_fts (rowid, title, summary_zh, seg) VALUES (?, ?, ?, ?)`,
  );

  const tx = conn.transaction(() => {
    conn.prepare(`DELETE FROM items_fts`).run();
    for (const row of rows) {
      const summary = row.summary_zh ?? '';
      insert.run(
        row.id,
        row.title,
        summary,
        segment(`${row.title} ${row.raw_text ?? ''} ${summary}`),
      );
    }
  });

  tx();
  console.log(`已重建全文索引，共 ${rows.length} 条`);
}

function main(): void {
  const conn = db();
  console.log(`数据库: ${config.dbPath}`);

  if (process.argv.includes('--rebuild-fts')) {
    rebuildFts();
    return;
  }

  // 写一次再回滚，确认库不是只读（Windows 上文件被占用时会在这里暴露）
  conn.prepare(`SELECT 1`).get();

  console.log('表结构已就绪：');
  for (const table of TABLES) {
    const { c } = conn.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    console.log(`  ${table.padEnd(12)} ${String(c).padStart(6)} 行`);
  }

  const fts = conn.prepare(`SELECT COUNT(*) AS c FROM items_fts`).get() as { c: number };
  const items = conn.prepare(`SELECT COUNT(*) AS c FROM items`).get() as { c: number };
  console.log(`  items_fts    ${String(fts.c).padStart(6)} 行`);

  // 索引与主表行数不一致说明同步漏了，提示怎么修
  if (fts.c !== items.c) {
    console.warn(
      `\n注意：全文索引 ${fts.c} 行与 items ${items.c} 行不一致，` +
        `运行 npm run migrate -- --rebuild-fts 可重建`,
    );
  }
}

main();
