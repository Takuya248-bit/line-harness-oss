-- Reel hypothesis metadata: extends schedule_queue.ab_test_meta (TEXT JSON).
-- No schema migration required; application code may include optional keys:
-- {
--   "hypothesis": "…",
--   "reelFormat": "ranking" | "cost_appeal" | "before_after" | "routine" | "relatable",
--   "hookStyle": "…",
--   "targetKpi": "saves" | "shares" | …,
--   "successThreshold": 0.05,
--   "reach": <number>, "saves": <number>, "shares": <number>  -- after insights backfill
-- }

CREATE VIEW IF NOT EXISTS reel_format_performance AS
SELECT
  json_extract(ab_test_meta, '$.reelFormat') AS reel_format,
  COUNT(*) AS total_posts,
  AVG(
    CAST(json_extract(ab_test_meta, '$.saves') AS REAL) /
    NULLIF(CAST(json_extract(ab_test_meta, '$.reach') AS REAL), 0)
  ) AS avg_save_rate,
  AVG(
    CAST(json_extract(ab_test_meta, '$.shares') AS REAL) /
    NULLIF(CAST(json_extract(ab_test_meta, '$.reach') AS REAL), 0)
  ) AS avg_share_rate
FROM schedule_queue
WHERE content_type = 'reel'
  AND status = 'posted'
  AND json_extract(ab_test_meta, '$.reelFormat') IS NOT NULL
GROUP BY json_extract(ab_test_meta, '$.reelFormat');
