/**
 * GET /api/insight/followers?accountId=xxx&days=30
 *
 * 日別 followers/targetedReaches/blocks 推移を返す.
 * ダッシュボード/グラフ描画用.
 */

import { Hono } from 'hono';
import { collectInsightFollowers } from '../services/insight-cron.js';
import type { Env } from '../index.js';

export const insightDashboard = new Hono<Env>();

interface InsightRow {
  insight_date: string;
  followers: number | null;
  targeted_reaches: number | null;
  blocks: number | null;
  created_at: string;
}

insightDashboard.get('/api/insight/followers', async (c) => {
  const accountId = c.req.query('accountId');
  const days = Math.min(parseInt(c.req.query('days') || '30', 10), 365);
  if (!accountId) {
    return c.json({ success: false, error: 'accountId required' }, 400);
  }

  const rows = await c.env.DB
    .prepare(
      `SELECT insight_date, followers, targeted_reaches, blocks, created_at
       FROM line_followers_insights
       WHERE line_account_id = ?
       ORDER BY insight_date DESC LIMIT ?`,
    )
    .bind(accountId, days)
    .all<InsightRow>();

  const data = (rows.results || []).reverse();

  // 直近の値
  const latest = data[data.length - 1];
  const firstInRange = data[0];
  const change =
    latest && firstInRange
      ? {
          followers: (latest.followers ?? 0) - (firstInRange.followers ?? 0),
          targeted_reaches: (latest.targeted_reaches ?? 0) - (firstInRange.targeted_reaches ?? 0),
          blocks: (latest.blocks ?? 0) - (firstInRange.blocks ?? 0),
        }
      : null;

  // block率 (最新)
  const blockRate =
    latest && latest.followers && latest.blocks
      ? ((latest.blocks / (latest.followers + latest.blocks)) * 100).toFixed(1)
      : null;

  return c.json({
    success: true,
    accountId,
    days: data.length,
    latest,
    change,
    blockRate: blockRate ? `${blockRate}%` : null,
    series: data,
  });
});

/**
 * POST /api/insight/collect  (admin)
 * 手動で insight collection を実行 (初回 backfill 用)
 */
insightDashboard.post('/api/insight/collect', async (c) => {
  const result = await collectInsightFollowers(c.env.DB);
  return c.json({ success: true, ...result });
});
