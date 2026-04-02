-- 承認待ちキュー
CREATE TABLE IF NOT EXISTS inquiry_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '不明',
  message TEXT NOT NULL,
  draft TEXT NOT NULL,
  final_reply TEXT,
  module TEXT NOT NULL DEFAULT 'inquiry',
  confidence REAL NOT NULL DEFAULT 0.5,
  phase TEXT,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  discord_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

-- 修正ログ（学習用）
CREATE TABLE IF NOT EXISTS inquiry_correction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiry_queue(id),
  correction_type TEXT NOT NULL,
  instruction TEXT,
  original_draft TEXT NOT NULL,
  final_draft TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inquiry_queue_status ON inquiry_queue(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_correction_type ON inquiry_correction_log(correction_type);
