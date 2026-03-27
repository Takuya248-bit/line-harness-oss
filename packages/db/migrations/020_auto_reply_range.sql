-- Add range matching support to auto_replies
-- SQLite doesn't allow ALTER CHECK constraints, so we recreate the table
-- match_type values: 'exact', 'contains', 'range_number', 'range_date'

CREATE TABLE IF NOT EXISTS auto_replies_new (
  id               TEXT PRIMARY KEY,
  keyword          TEXT NOT NULL DEFAULT '',
  match_type       TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'range_number', 'range_date')) DEFAULT 'exact',
  response_type    TEXT NOT NULL DEFAULT 'text',
  response_content TEXT NOT NULL,
  range_min        TEXT,
  range_max        TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  line_account_id  TEXT
);

INSERT INTO auto_replies_new (id, keyword, match_type, response_type, response_content, is_active, created_at, line_account_id)
  SELECT id, keyword, match_type, response_type, response_content, is_active, created_at, line_account_id
  FROM auto_replies;

DROP TABLE auto_replies;
ALTER TABLE auto_replies_new RENAME TO auto_replies;
