-- 知識エントリ（事実・観察・実例を1件ずつ格納）
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  subcategory TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  source TEXT DEFAULT 'firsthand',
  reliability TEXT DEFAULT 'verified',
  use_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_reliability ON knowledge_entries(reliability);

-- スタイル・ガードレール（文体と禁止事項）
CREATE TABLE IF NOT EXISTS content_guardrails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL,
  platform TEXT DEFAULT 'all',
  rule TEXT NOT NULL,
  example TEXT,
  priority INTEGER DEFAULT 5
);

-- テーマ-知識マッピング（定番の組み合わせ）
CREATE TABLE IF NOT EXISTS theme_knowledge_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT NOT NULL,
  knowledge_entry_id INTEGER NOT NULL,
  relevance INTEGER DEFAULT 5,
  FOREIGN KEY (knowledge_entry_id) REFERENCES knowledge_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_theme_map_theme ON theme_knowledge_map(theme);
