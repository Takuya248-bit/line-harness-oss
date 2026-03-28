-- Bali info投稿の重複回避テーブル
CREATE TABLE IF NOT EXISTS posted_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  area TEXT,
  theme TEXT,
  spots_json TEXT NOT NULL,
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posted_topics_category ON posted_topics(category);
