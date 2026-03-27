import { Hono } from 'hono';
import type { Env } from '../index.js';

const analytics = new Hono<Env>();

// ========== GET /api/analytics/overview ==========
// 友だち数推移、メッセージ数、配信数のサマリー
analytics.get('/api/analytics/overview', async (c) => {
  try {
    const db = c.env.DB;
    const days = Number(c.req.query('days') ?? '30');
    const lineAccountId = c.req.query('lineAccountId');

    // 友だち総数
    const friendWhere = lineAccountId ? 'WHERE line_account_id = ?' : '';
    const friendBinds = lineAccountId ? [lineAccountId] : [];
    const friendTotal = await db
      .prepare(`SELECT COUNT(*) as count FROM friends ${friendWhere}`)
      .bind(...friendBinds)
      .first<{ count: number }>();

    // フォロー中の友だち数
    const followingTotal = await db
      .prepare(`SELECT COUNT(*) as count FROM friends ${friendWhere ? friendWhere + ' AND' : 'WHERE'} is_following = 1`)
      .bind(...friendBinds)
      .first<{ count: number }>();

    // 期間内メッセージ数
    const msgTotal = await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
          SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
        FROM messages_log
        WHERE created_at >= datetime('now', '-' || ? || ' days')`,
      )
      .bind(days)
      .first<{ total: number; incoming: number; outgoing: number }>();

    // 配信数（sent状態のbroadcast）
    const broadcastWhere = lineAccountId ? 'AND line_account_id = ?' : '';
    const broadcastBinds = lineAccountId ? [days, lineAccountId] : [days];
    const broadcastTotal = await db
      .prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(success_count), 0) as delivered
        FROM broadcasts
        WHERE status = 'sent' AND created_at >= datetime('now', '-' || ? || ' days') ${broadcastWhere}`,
      )
      .bind(...broadcastBinds)
      .first<{ count: number; delivered: number }>();

    // 日別の友だち追加数（直近N日）
    const friendTrend = await db
      .prepare(
        `SELECT DATE(created_at) as date, COUNT(*) as count
        FROM friends
        ${friendWhere ? friendWhere + ' AND' : 'WHERE'} created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
      )
      .bind(...[...friendBinds, days])
      .all<{ date: string; count: number }>();

    return c.json({
      success: true,
      data: {
        friendsTotal: friendTotal?.count ?? 0,
        friendsFollowing: followingTotal?.count ?? 0,
        messages: {
          total: msgTotal?.total ?? 0,
          incoming: msgTotal?.incoming ?? 0,
          outgoing: msgTotal?.outgoing ?? 0,
        },
        broadcasts: {
          count: broadcastTotal?.count ?? 0,
          delivered: broadcastTotal?.delivered ?? 0,
        },
        friendTrend: friendTrend.results,
        days,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/overview error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== GET /api/analytics/messages ==========
// 日別のincoming / outgoing数
analytics.get('/api/analytics/messages', async (c) => {
  try {
    const db = c.env.DB;
    const days = Number(c.req.query('days') ?? '30');

    const rows = await db
      .prepare(
        `SELECT
          DATE(created_at) as date,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
          SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing,
          COUNT(*) as total
        FROM messages_log
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
      )
      .bind(days)
      .all<{ date: string; incoming: number; outgoing: number; total: number }>();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET /api/analytics/messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== GET /api/analytics/automations ==========
// キーワード別ヒット数ランキング
analytics.get('/api/analytics/automations', async (c) => {
  try {
    const db = c.env.DB;
    const days = Number(c.req.query('days') ?? '30');
    const limit = Number(c.req.query('limit') ?? '20');

    const rows = await db
      .prepare(
        `SELECT
          a.id,
          a.name,
          a.event_type,
          a.conditions,
          COUNT(al.id) as hit_count,
          SUM(CASE WHEN al.status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN al.status = 'failed' THEN 1 ELSE 0 END) as failed_count
        FROM automations a
        LEFT JOIN automation_logs al ON al.automation_id = a.id
          AND al.created_at >= datetime('now', '-' || ? || ' days')
        WHERE a.is_active = 1
        GROUP BY a.id
        ORDER BY hit_count DESC
        LIMIT ?`,
      )
      .bind(days, limit)
      .all<{
        id: string;
        name: string;
        event_type: string;
        conditions: string;
        hit_count: number;
        success_count: number;
        failed_count: number;
      }>();

    return c.json({
      success: true,
      data: rows.results.map((r) => {
        const cond = JSON.parse(r.conditions || '{}');
        return {
          id: r.id,
          name: r.name,
          eventType: r.event_type,
          keyword: cond.keyword ?? null,
          matchType: cond.matchType ?? null,
          hitCount: r.hit_count,
          successCount: r.success_count,
          failedCount: r.failed_count,
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/analytics/automations error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== GET /api/analytics/scenarios ==========
// シナリオ別の完了率
analytics.get('/api/analytics/scenarios', async (c) => {
  try {
    const db = c.env.DB;
    const lineAccountId = c.req.query('lineAccountId');

    const accountFilter = lineAccountId ? 'AND s.line_account_id = ?' : '';
    const binds = lineAccountId ? [lineAccountId] : [];

    const rows = await db
      .prepare(
        `SELECT
          s.id,
          s.name,
          s.is_active,
          COUNT(fs.id) as enrolled_count,
          SUM(CASE WHEN fs.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN fs.status = 'active' THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN fs.status = 'paused' THEN 1 ELSE 0 END) as paused_count
        FROM scenarios s
        LEFT JOIN friend_scenarios fs ON fs.scenario_id = s.id
        WHERE 1 = 1 ${accountFilter}
        GROUP BY s.id
        ORDER BY enrolled_count DESC`,
      )
      .bind(...binds)
      .all<{
        id: string;
        name: string;
        is_active: number;
        enrolled_count: number;
        completed_count: number;
        active_count: number;
        paused_count: number;
      }>();

    return c.json({
      success: true,
      data: rows.results.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: Boolean(r.is_active),
        enrolledCount: r.enrolled_count,
        completedCount: r.completed_count,
        activeCount: r.active_count,
        pausedCount: r.paused_count,
        completionRate:
          r.enrolled_count > 0
            ? Math.round((r.completed_count / r.enrolled_count) * 100)
            : 0,
      })),
    });
  } catch (err) {
    console.error('GET /api/analytics/scenarios error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== GET /api/analytics/funnel ==========
// フェーズ別ファネル分析（phase_*タグベース）
analytics.get('/api/analytics/funnel', async (c) => {
  try {
    const db = c.env.DB;
    const lineAccountId = c.req.query('lineAccountId');

    // フェーズ順序定義（休眠は別枠）
    const phaseOrder = [
      'phase_未相談',
      'phase_相談済',
      'phase_見積送付済',
      'phase_入金待ち',
      'phase_入金済',
      'phase_休眠',
    ];

    // 各フェーズの現在人数
    const accountJoin = lineAccountId
      ? 'JOIN friends f ON f.id = ft.friend_id AND f.line_account_id = ?'
      : '';
    const phaseBinds = lineAccountId ? [lineAccountId] : [];

    const phaseRows = await db
      .prepare(
        `SELECT t.id as tag_id, t.name, COUNT(DISTINCT ft.friend_id) as count
         FROM friend_tags ft
         JOIN tags t ON t.id = ft.tag_id
         ${accountJoin}
         WHERE t.name LIKE 'phase_%'
         GROUP BY t.id, t.name
         ORDER BY t.name`,
      )
      .bind(...phaseBinds)
      .all<{ tag_id: string; name: string; count: number }>();

    // フェーズデータをマップに変換
    const phaseMap = new Map<string, { name: string; count: number; tag_id: string }>();
    for (const row of phaseRows.results) {
      phaseMap.set(row.name, { name: row.name, count: row.count, tag_id: row.tag_id });
    }

    // 順序通りにフェーズ配列を構成（データがないフェーズは0人で表示）
    const phases = phaseOrder.map((name) => phaseMap.get(name) ?? { name, count: 0, tag_id: '' });

    // コンバージョン率の算出（休眠を除くメインファネル）
    const mainPhases = phaseOrder.filter((p) => p !== 'phase_休眠');
    const conversions: Array<{ from: string; to: string; rate: number; count: number }> = [];
    for (let i = 0; i < mainPhases.length - 1; i++) {
      const fromPhase = phaseMap.get(mainPhases[i]);
      const toPhase = phaseMap.get(mainPhases[i + 1]);
      const fromCount = fromPhase?.count ?? 0;
      const toCount = toPhase?.count ?? 0;
      conversions.push({
        from: mainPhases[i],
        to: mainPhases[i + 1],
        rate: fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : 0,
        count: toCount,
      });
    }

    // 友だち総数
    const friendWhere = lineAccountId ? 'WHERE line_account_id = ?' : '';
    const friendBinds = lineAccountId ? [lineAccountId] : [];
    const totalRow = await db
      .prepare(`SELECT COUNT(*) as count FROM friends ${friendWhere}`)
      .bind(...friendBinds)
      .first<{ count: number }>();

    return c.json({
      success: true,
      data: {
        phases,
        conversions,
        total_friends: totalRow?.count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/funnel error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== POST /api/analytics/cross-tags ==========
// タグ×タグのクロス分析（重複友だち数マトリクス）
analytics.post('/api/analytics/cross-tags', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json<{ tagIds: string[]; lineAccountId?: string }>();
    const { tagIds, lineAccountId } = body;

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return c.json({ success: false, error: 'tagIds is required and must be a non-empty array' }, 400);
    }
    if (!lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }

    const { crossAnalyzeTagVsTag } = await import('@line-crm/db');
    const result = await crossAnalyzeTagVsTag(db, lineAccountId, tagIds);

    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('POST /api/analytics/cross-tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== POST /api/analytics/cross-tag-scenario ==========
// タグ×シナリオのクロス分析（タグ別シナリオ進捗）
analytics.post('/api/analytics/cross-tag-scenario', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json<{ tagIds: string[]; scenarioIds: string[]; lineAccountId?: string }>();
    const { tagIds, scenarioIds, lineAccountId } = body;

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return c.json({ success: false, error: 'tagIds is required and must be a non-empty array' }, 400);
    }
    if (!scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return c.json({ success: false, error: 'scenarioIds is required and must be a non-empty array' }, 400);
    }
    if (!lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }

    const { crossAnalyzeTagVsScenario } = await import('@line-crm/db');
    const result = await crossAnalyzeTagVsScenario(db, lineAccountId, tagIds, scenarioIds);

    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('POST /api/analytics/cross-tag-scenario error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { analytics };
