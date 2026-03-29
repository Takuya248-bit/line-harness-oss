-- AI海外ソース自動収集
CREATE TABLE IF NOT EXISTS x_ai_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT,
  score INTEGER DEFAULT 0,
  collected_at TEXT NOT NULL,
  used_in_post INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_x_ai_sources_type ON x_ai_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_x_ai_sources_used ON x_ai_sources(used_in_post);
CREATE INDEX IF NOT EXISTS idx_x_ai_sources_collected ON x_ai_sources(collected_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_x_ai_sources_ext ON x_ai_sources(source_type, external_id);
