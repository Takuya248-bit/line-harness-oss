-- pattern_weights: 48パターンの採用率重みを管理
CREATE TABLE IF NOT EXISTS pattern_weights (
  pattern_id TEXT PRIMARY KEY,  -- 例: "education_bright_study_abroad"
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- generated_contentにpattern_idとcontent_typeカラムを追加
ALTER TABLE generated_content ADD COLUMN pattern_id TEXT;
ALTER TABLE generated_content ADD COLUMN content_type TEXT DEFAULT 'feed';
ALTER TABLE generated_content ADD COLUMN topic_id TEXT;
ALTER TABLE generated_content ADD COLUMN script TEXT;
ALTER TABLE generated_content ADD COLUMN hashtags TEXT;
ALTER TABLE generated_content ADD COLUMN image_r2_key TEXT;
ALTER TABLE generated_content ADD COLUMN video_r2_key TEXT;
ALTER TABLE generated_content ADD COLUMN reviewed_at TEXT;
