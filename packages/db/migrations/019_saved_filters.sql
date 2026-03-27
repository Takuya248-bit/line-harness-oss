CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  line_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filter_conditions TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_account ON saved_filters(line_account_id);
