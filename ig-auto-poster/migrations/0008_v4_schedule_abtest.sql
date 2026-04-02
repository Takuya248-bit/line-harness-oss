-- スケジュールキュー
CREATE TABLE IF NOT EXISTS schedule_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL DEFAULT 'carousel',
  content_json TEXT NOT NULL,
  caption TEXT NOT NULL,
  media_urls TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '18:00',
  status TEXT NOT NULL DEFAULT 'pending',
  ab_test_meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  ig_media_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_schedule_queue_status_date
  ON schedule_queue(status, scheduled_date);

-- A/Bテスト定義
CREATE TABLE IF NOT EXISTS ab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_week TEXT NOT NULL,
  test_axis TEXT NOT NULL,
  test_variant TEXT NOT NULL,
  control_variant TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  winner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- A/Bテスト結果（投稿ごと）
CREATE TABLE IF NOT EXISTS ab_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES ab_tests(id),
  queue_id INTEGER NOT NULL REFERENCES schedule_queue(id),
  is_control INTEGER NOT NULL DEFAULT 0,
  variant_value TEXT NOT NULL,
  reach INTEGER,
  saves INTEGER,
  shares INTEGER,
  profile_visits INTEGER,
  save_rate REAL,
  collected_at TEXT
);

-- 勝ちパターン履歴
CREATE TABLE IF NOT EXISTS winning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  axis TEXT NOT NULL,
  variant_value TEXT NOT NULL,
  save_rate REAL NOT NULL,
  test_week TEXT NOT NULL,
  promoted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ファネルKPI週次スナップショット
CREATE TABLE IF NOT EXISTS weekly_kpi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL UNIQUE,
  total_reach INTEGER NOT NULL DEFAULT 0,
  avg_save_rate REAL NOT NULL DEFAULT 0,
  avg_share_rate REAL NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  line_registrations INTEGER NOT NULL DEFAULT 0,
  bottleneck TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
