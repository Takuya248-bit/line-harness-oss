-- 016: Add response_status column to friends table (対応マーク機能)
-- Values: 'none' (未対応), 'in_progress' (対応中), 'done' (対応済み)

ALTER TABLE friends ADD COLUMN response_status TEXT DEFAULT 'none';

CREATE INDEX idx_friends_response_status ON friends(response_status);
