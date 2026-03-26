-- Migration: Add delivery_hour to scenario_steps for time-of-day scheduling
-- This allows scenarios to specify "1 day later at 12:00 JST" instead of just delay_minutes
--
-- Usage:
--   wrangler d1 execute <DB_NAME> --file=packages/db/migrations/012_scenario_delivery_hour.sql
--   wrangler d1 execute <DB_NAME> --file=packages/db/migrations/012_scenario_delivery_hour.sql --remote

ALTER TABLE scenario_steps ADD COLUMN delivery_hour INTEGER DEFAULT NULL;
