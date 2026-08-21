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

  instance = conn;
  return conn;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
