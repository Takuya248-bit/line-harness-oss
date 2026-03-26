-- X (Twitter) 自動投稿システム
CREATE TABLE IF NOT EXISTS x_posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  image_url TEXT,
  post_type TEXT NOT NULL DEFAULT 'single', -- single, thread, reply
  thread_parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, posting, posted, failed
  scheduled_at TEXT,
  posted_at TEXT,
  x_post_id TEXT, -- X側の投稿ID
  error_message TEXT,
  category TEXT, -- tips, case_study, cost_comparison, tool_guide, engagement
  cta_type TEXT DEFAULT 'none', -- none, line, coconala, both
  ai_generated INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS x_post_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- tips, case_study, cost_comparison, tool_guide, engagement
  template_text TEXT NOT NULL,
  cta_type TEXT DEFAULT 'line',
  variables TEXT, -- JSON: 置換可能な変数リスト
  is_active INTEGER DEFAULT 1,
  use_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS x_post_logs (
  id TEXT PRIMARY KEY,
  x_post_id TEXT NOT NULL,
  action TEXT NOT NULL, -- created, deleted, error
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (x_post_id) REFERENCES x_posts(id)
);

CREATE INDEX IF NOT EXISTS idx_x_posts_status ON x_posts(status);
CREATE INDEX IF NOT EXISTS idx_x_posts_scheduled ON x_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_x_posts_category ON x_posts(category);
