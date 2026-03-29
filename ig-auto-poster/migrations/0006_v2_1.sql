-- カテゴリ別生成比率
CREATE TABLE IF NOT EXISTS category_weights (
  category TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.125,
  avg_saves REAL DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 初期データ（8カテゴリ）
INSERT OR IGNORE INTO category_weights (category, weight) VALUES
  ('cafe', 0.20),
  ('spot', 0.15),
  ('food', 0.15),
  ('beach', 0.10),
  ('lifestyle', 0.10),
  ('cost', 0.10),
  ('visa', 0.10),
  ('culture', 0.10);

-- 投稿パフォーマンス記録
CREATE TABLE IF NOT EXISTS post_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ig_media_id TEXT NOT NULL,
  category TEXT NOT NULL,
  saves INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_perf_category ON post_performance(category);
CREATE INDEX IF NOT EXISTS idx_post_perf_measured ON post_performance(measured_at);

-- 設定テーブル
CREATE TABLE IF NOT EXISTS ig_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO ig_settings (key, value) VALUES ('auto_approve', 'false');

-- generated_contentにcategoryカラム追加
ALTER TABLE generated_content ADD COLUMN category TEXT DEFAULT NULL;
