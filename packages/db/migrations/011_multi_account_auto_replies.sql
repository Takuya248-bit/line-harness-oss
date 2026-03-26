-- Migration 011: Add line_account_id to auto_replies for multi-account support
-- Run: wrangler d1 execute line-crm --file=packages/db/migrations/011_multi_account_auto_replies.sql --remote

ALTER TABLE auto_replies ADD COLUMN line_account_id TEXT;
