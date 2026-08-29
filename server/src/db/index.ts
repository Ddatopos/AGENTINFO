import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config, DATA_DIR } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

/** 惰性单例。首次调用时建目录、建表、设 PRAGMA。 */
export function db(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const conn = new Database(config.dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  conn.exec(schema);

  try {
    conn.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT`);
  } catch {
    // 已存在则忽略
  }

  try {
    conn.exec(`ALTER TABLE sources ADD COLUMN fetch_status TEXT NOT NULL DEFAULT 'idle' CHECK(fetch_status IN ('idle','running'))`);
  } catch {
    // 已存在则忽略
  }

  try {
    conn.prepare(`UPDATE sources SET fetch_status = 'idle' WHERE fetch_status = 'running'`).run();
  } catch {
    // 列不存在时忽略（旧数据库迁移中）
  }

  try {
    conn.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id)`);
  } catch {
    // 索引已存在或表无该列则忽略
  }

  instance = conn;
  return conn;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
