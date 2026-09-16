import { Hono } from 'hono';
import type { Env } from '../index.js';
import { LSTEP_MANAGED_ACCOUNT_IDS, OS_BARILINGUAL_ID } from './webhook.js';

export const BALILINGUAL_PARALLEL_LINE_ACCOUNT_ID = OS_BARILINGUAL_ID;

const balilingualParallelStatus = new Hono<Env>();

type CountRow = { count: number };
type MessageCountRow = { total: number; incoming: number; outgoing: number };

balilingualParallelStatus.get('/api/balilingual/parallel-status', async (c) => {
  try {
    const db = c.env.DB;
    const lineAccountId = BALILINGUAL_PARALLEL_LINE_ACCOUNT_ID;

    const [
      friendsTotal,
      friendsAddedToday,
      messages24h,
      automationActiveCount,
      scenarioActiveCount,
    ] = await Promise.all([
      db
        .prepare('SELECT COUNT(*) as count FROM friends WHERE line_account_id = ?')
        .bind(lineAccountId)
        .first<CountRow>(),
      db
        .prepare(
          `SELECT COUNT(*) as count
           FROM friends
           WHERE line_account_id = ?
             AND created_at >= strftime('%Y-%m-%dT00:00:00', 'now', '+9 hours')`,
        )
        .bind(lineAccountId)
        .first<CountRow>(),
      db
        .prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN ml.direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
             SUM(CASE WHEN ml.direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
           FROM messages_log ml
           JOIN friends f ON f.id = ml.friend_id
           WHERE f.line_account_id = ?
             AND ml.created_at >= strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours', '-24 hours')`,
        )
        .bind(lineAccountId)
        .first<MessageCountRow>(),
      db
        .prepare('SELECT COUNT(*) as count FROM automations WHERE line_account_id = ? AND is_active = 1')
        .bind(lineAccountId)
        .first<CountRow>(),
      db
        .prepare('SELECT COUNT(*) as count FROM scenarios WHERE line_account_id = ? AND is_active = 1')
        .bind(lineAccountId)
        .first<CountRow>(),
    ]);

    return c.json({
      success: true,
      data: {
        line_account_id: lineAccountId,
        friends_total: friendsTotal?.count ?? 0,
        friends_added_today: friendsAddedToday?.count ?? 0,
        messages_log_count_24h: {
          total: messages24h?.total ?? 0,
          incoming: messages24h?.incoming ?? 0,
          outgoing: messages24h?.outgoing ?? 0,
        },
        automation_active_count: automationActiveCount?.count ?? 0,
        scenario_active_count: scenarioActiveCount?.count ?? 0,
        lstep_forward_url_set: Boolean(c.env.LSTEP_WEBHOOK_URL),
        parallel_mode_active: LSTEP_MANAGED_ACCOUNT_IDS.includes(lineAccountId),
      },
    });
  } catch (err) {
    console.error('GET /api/balilingual/parallel-status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { balilingualParallelStatus };
