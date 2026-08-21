-- agentInfo 数据库结构
-- 原则：原始抓取数据（items）与 LLM 产出（enrichments）分表，重跑 LLM 不影响已抓内容

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- rss | github_search | github_trending | hn | hf_models | hf_papers | html
  url           TEXT NOT NULL,
  tier          TEXT NOT NULL,              -- A(每小时) | B(每6小时) | C(每天)
  authority     REAL NOT NULL DEFAULT 0.5,  -- 0..1，参与热度公式
  enabled       INTEGER NOT NULL DEFAULT 1,
  etag          TEXT,                       -- 条件请求，省带宽
  last_modified TEXT,
  last_fetch_at INTEGER,
  fail_streak   INTEGER NOT NULL DEFAULT 0  -- 连续失败次数，超阈值自动停用
);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  dedupe_key   TEXT NOT NULL UNIQUE,        -- 规范化 URL 的 sha256；无 URL 时用标题 hash
  title_hash   TEXT,                        -- 归一化标题 hash，用于跨源转载判重
  url          TEXT,
  title        TEXT NOT NULL,
  author       TEXT,
  raw_text     TEXT,
  lang         TEXT,                        -- zh | en
  published_at INTEGER,
  ingested_at  INTEGER NOT NULL,
  metrics_json TEXT,                        -- {points,comments,stars,upvotes,downloads}
  raw_json     TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_pub   ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_src   ON items(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_title ON items(title_hash);

CREATE TABLE IF NOT EXISTS enrichments (
  item_id        INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  summary_zh     TEXT,
  tags_json      TEXT,
  category       TEXT,
  relevance      INTEGER,                   -- 0..100
  is_noise       INTEGER NOT NULL DEFAULT 0,
  model          TEXT,                      -- 'rule' 表示降级的关键词规则
  prompt_version INTEGER NOT NULL DEFAULT 1,
  tokens_in      INTEGER NOT NULL DEFAULT 0,
  tokens_out     INTEGER NOT NULL DEFAULT 0,
  failed         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrich_cat ON enrichments(category);

CREATE TABLE IF NOT EXISTS scores (
  item_id     INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  heat        REAL NOT NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_heat ON scores(heat DESC);

CREATE TABLE IF NOT EXISTS briefings (
  id         INTEGER PRIMARY KEY,
  period     TEXT NOT NULL,                 -- daily | weekly
  period_key TEXT NOT NULL,                 -- 2026-08-20 / 2026-W34
  md_path    TEXT,
  content_md TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(period, period_key)
);

CREATE TABLE IF NOT EXISTS fetch_log (
  id          INTEGER PRIMARY KEY,
  source_id   TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  duration_ms INTEGER,
  ok          INTEGER NOT NULL,
  http_status INTEGER,
  new_items   INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_fetchlog_src ON fetch_log(source_id, started_at DESC);

-- 全文检索。用普通 FTS5 表而非 content='' 无内容表：
-- 标题在 items、摘要在 enrichments，跨两表无法用 external content
-- seg 列存 Intl.Segmenter 预分词结果，解决 FTS5 默认分词器切不开中文的问题
-- rowid 与 items.id 对齐，由应用层在 upsert 时手动同步
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(title, summary_zh, seg);
