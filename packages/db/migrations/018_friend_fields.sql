CREATE TABLE IF NOT EXISTS friend_fields (
  id TEXT PRIMARY KEY,
  line_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options TEXT,
  sort_order INTEGER DEFAULT 0,
  is_required INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_fields_key ON friend_fields(line_account_id, field_key);
CREATE INDEX IF NOT EXISTS idx_friend_fields_account ON friend_fields(line_account_id);
