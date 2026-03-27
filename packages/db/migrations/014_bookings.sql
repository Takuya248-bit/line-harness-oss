-- 014: 予約管理テーブル（Google Calendar連携）
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  friend_id TEXT NOT NULL,
  line_account_id TEXT,
  title TEXT NOT NULL DEFAULT 'オンライン面談',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  google_event_id TEXT,
  status TEXT DEFAULT 'confirmed',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_friend ON bookings(friend_id);
CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
