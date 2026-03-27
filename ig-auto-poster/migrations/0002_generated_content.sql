-- AI生成コンテンツ管理テーブル
CREATE TABLE IF NOT EXISTS generated_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  caption TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  ig_media_id TEXT
);

-- ステータスインデックス（pending_review/approved の検索高速化）
CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content(status);
