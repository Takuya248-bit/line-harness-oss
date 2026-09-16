-- Migration 023: A/B Test infrastructure
-- スコープ: アカウント別の A/B テスト. friend単位で variant を固定割当し、
-- シナリオステップ・自動応答・broadcast から variant を参照する.

CREATE TABLE IF NOT EXISTS ab_tests (
  id              TEXT PRIMARY KEY,
  line_account_id TEXT REFERENCES line_accounts(id),
  name            TEXT NOT NULL,
  description     TEXT,
  variants        TEXT NOT NULL DEFAULT '["A","B"]',     -- JSON配列 ["A","B"] or ["A","B","C"]
  weights         TEXT NOT NULL DEFAULT '[50,50]',       -- JSON配列 [50,50] etc. variantsと同長
  assignment_seed TEXT NOT NULL DEFAULT '',              -- friend_idとhash合成のseed
  is_active       INTEGER NOT NULL DEFAULT 1,
  starts_at       TEXT,
  ends_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE TABLE IF NOT EXISTS ab_assignments (
  id          TEXT PRIMARY KEY,
  ab_test_id  TEXT NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  friend_id   TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  variant     TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE (ab_test_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_friend ON ab_assignments(friend_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_test ON ab_assignments(ab_test_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_account ON ab_tests(line_account_id);

-- 集計用イベント (variant別の到達/CV測定)
CREATE TABLE IF NOT EXISTS ab_events (
  id          TEXT PRIMARY KEY,
  ab_test_id  TEXT NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  friend_id   TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  variant     TEXT NOT NULL,
  event_type  TEXT NOT NULL,            -- 'exposure', 'cv_consultation', 'cv_estimate', 'cv_paid' など
  event_value INTEGER,                  -- 任意 (金額など)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_ab_events_test ON ab_events(ab_test_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ab_events_friend ON ab_events(friend_id);
