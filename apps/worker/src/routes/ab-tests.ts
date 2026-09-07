import { Hono } from 'hono';
import {
  getActiveAbTests,
  assignFriendToVariant,
  recordAbEvent,
  type AbTestRow,
} from '../services/ab-test.js';
import type { Env } from '../index.js';

const abTests = new Hono<Env>();

// GET /api/ab-tests - 一覧 (アカウント別フィルタ可)
abTests.get('/api/ab-tests', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    const includeInactive = c.req.query('includeInactive') === 'true';
    const accountClause = lineAccountId ? 'WHERE line_account_id = ? OR line_account_id IS NULL' : '';
    const binds = lineAccountId ? [lineAccountId] : [];
    const sql = `SELECT * FROM ab_tests ${accountClause} ${includeInactive ? '' : (accountClause ? 'AND is_active = 1' : 'WHERE is_active = 1')} ORDER BY created_at DESC`;
    const result = await c.env.DB.prepare(sql).bind(...binds).all<AbTestRow>();
    return c.json({
      success: true,
      data: result.results.map((r) => ({
        id: r.id,
        lineAccountId: r.line_account_id,
        name: r.name,
        variants: JSON.parse(r.variants),
        weights: JSON.parse(r.weights),
        isActive: Boolean(r.is_active),
        startsAt: r.starts_at,
        endsAt: r.ends_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/ab-tests error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/ab-tests - 作成
abTests.post('/api/ab-tests', async (c) => {
  try {
    const body = await c.req.json<{
      lineAccountId?: string | null;
      name: string;
      description?: string;
      variants: string[];
      weights?: number[];
      assignmentSeed?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    }>();
    if (!body.name || !body.variants || body.variants.length < 2) {
      return c.json({ success: false, error: 'name and >=2 variants required' }, 400);
    }
    const weights = body.weights ?? body.variants.map(() => Math.floor(100 / body.variants.length));
    if (weights.length !== body.variants.length) {
      return c.json({ success: false, error: 'weights length must match variants' }, 400);
    }
    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(
        `INSERT INTO ab_tests (id, line_account_id, name, description, variants, weights, assignment_seed, starts_at, ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.lineAccountId ?? null,
        body.name,
        body.description ?? null,
        JSON.stringify(body.variants),
        JSON.stringify(weights),
        body.assignmentSeed ?? id,
        body.startsAt ?? null,
        body.endsAt ?? null,
      )
      .run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    console.error('POST /api/ab-tests error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/ab-tests/:id/assign - friend を variant に割当 (冪等)
abTests.post('/api/ab-tests/:id/assign', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ friendId: string }>();
    const test = await c.env.DB.prepare(`SELECT * FROM ab_tests WHERE id = ?`).bind(id).first<AbTestRow>();
    if (!test) return c.json({ success: false, error: 'ab_test not found' }, 404);
    const variant = await assignFriendToVariant(c.env.DB, test, body.friendId);
    return c.json({ success: true, data: { abTestId: id, friendId: body.friendId, variant } });
  } catch (err) {
    console.error('POST /api/ab-tests/:id/assign error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/ab-tests/:id/events - イベント記録
abTests.post('/api/ab-tests/:id/events', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ friendId: string; eventType: string; eventValue?: number }>();
    const assignment = await c.env.DB
      .prepare(`SELECT variant FROM ab_assignments WHERE ab_test_id = ? AND friend_id = ?`)
      .bind(id, body.friendId)
      .first<{ variant: string }>();
    if (!assignment) return c.json({ success: false, error: 'friend not assigned to this ab_test' }, 404);
    await recordAbEvent(c.env.DB, id, body.friendId, assignment.variant, body.eventType, body.eventValue);
    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/ab-tests/:id/events error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/ab-tests/:id/results - 集計
abTests.get('/api/ab-tests/:id/results', async (c) => {
  try {
    const id = c.req.param('id');
    const assignments = await c.env.DB
      .prepare(`SELECT variant, COUNT(*) as count FROM ab_assignments WHERE ab_test_id = ? GROUP BY variant`)
      .bind(id)
      .all<{ variant: string; count: number }>();
    const events = await c.env.DB
      .prepare(
        `SELECT variant, event_type, COUNT(*) as count, SUM(COALESCE(event_value, 0)) as total
         FROM ab_events
         WHERE ab_test_id = ?
         GROUP BY variant, event_type`,
      )
      .bind(id)
      .all<{ variant: string; event_type: string; count: number; total: number }>();
    return c.json({
      success: true,
      data: {
        assignments: assignments.results,
        events: events.results,
      },
    });
  } catch (err) {
    console.error('GET /api/ab-tests/:id/results error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { abTests };
