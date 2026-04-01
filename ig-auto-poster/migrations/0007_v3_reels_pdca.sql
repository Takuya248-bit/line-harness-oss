-- generated_contentにformat_type + template_name追加
ALTER TABLE generated_content ADD COLUMN format_type TEXT DEFAULT 'carousel';
ALTER TABLE generated_content ADD COLUMN template_name TEXT DEFAULT NULL;

-- post_performanceにformat_type + shares追加
ALTER TABLE post_performance ADD COLUMN format_type TEXT DEFAULT 'carousel';
ALTER TABLE post_performance ADD COLUMN shares INTEGER DEFAULT 0;

-- フォーマット別重み（carousel vs reel の配分）
CREATE TABLE IF NOT EXISTS format_weights (
  format_type TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.5,
  avg_engagement REAL DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO format_weights (format_type, weight) VALUES
  ('carousel', 0.6),
  ('reel', 0.4);

-- コンテンツテンプレートタイプ
CREATE TABLE IF NOT EXISTS content_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  format_type TEXT NOT NULL DEFAULT 'carousel',
  weight REAL NOT NULL DEFAULT 0.1,
  description TEXT,
  enabled INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO content_templates (name, format_type, weight, description) VALUES
  ('spot_list', 'carousel', 0.20, 'エリア別○選（既存V2）'),
  ('quiz', 'carousel', 0.15, 'クイズ形式（Q→A→解説）'),
  ('before_after', 'carousel', 0.15, '留学ビフォーアフター'),
  ('cost_compare', 'carousel', 0.15, '費用比較（フィリピン vs バリ等）'),
  ('student_voice', 'carousel', 0.10, '卒業生の声'),
  ('hook_facts', 'reel', 0.30, 'フック→事実→CTA（15-30秒）'),
  ('day_in_life', 'reel', 0.20, '留学生の1日（30-60秒）'),
  ('quick_tips', 'reel', 0.25, 'バリ生活Tips（15秒）');
