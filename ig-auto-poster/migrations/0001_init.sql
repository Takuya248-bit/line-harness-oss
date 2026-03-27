-- Instagram auto-poster state management
CREATE TABLE IF NOT EXISTS ig_post_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content_index INTEGER NOT NULL DEFAULT 0,
  last_posted_at TEXT
);

-- Initialize with default state
INSERT INTO ig_post_state (id, content_index) VALUES (1, 0);
