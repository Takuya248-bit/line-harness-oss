import { Hono } from 'hono';
import {
  getFriends,
  getFriendById,
  getFriendByLineUserId,
  getFriendCount,
  upsertFriend,
  addTagToFriend,
  removeTagFromFriend,
  getFriendTags,
  getTags,
  createTag,
  getScenarios,
  enrollFriendInScenario,
  jstNow,
} from '@line-crm/db';
import type { Friend as DbFriend, Tag as DbTag } from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage } from '../services/step-delivery.js';
import { parseLstepCsv } from '../utils/csv-parser.js';
import type { ImportFriendRow } from '../utils/csv-parser.js';
import type { Env } from '../index.js';

const friends = new Hono<Env>();

/** Convert a D1 snake_case Friend row to the shared camelCase shape */
function serializeFriend(row: DbFriend) {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    statusMessage: row.status_message,
    isFollowing: Boolean(row.is_following),
    metadata: JSON.parse(row.metadata || '{}'),
    refCode: (row as unknown as Record<string, unknown>).ref_code as string | null,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Convert a D1 snake_case Tag row to the shared camelCase shape */
function serializeTag(row: DbTag) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// GET /api/friends - list with pagination
friends.get('/api/friends', async (c) => {
  try {
    const limit = Number(c.req.query('limit') ?? '50');
    const offset = Number(c.req.query('offset') ?? '0');
    const tagId = c.req.query('tagId');
    const lineAccountId = c.req.query('lineAccountId');

    const db = c.env.DB;

    // Build WHERE conditions
    const conditions: string[] = [];
    const binds: unknown[] = [];
    if (tagId) {
      conditions.push('EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)');
      binds.push(tagId);
    }
    if (lineAccountId) {
      conditions.push('f.line_account_id = ?');
      binds.push(lineAccountId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM friends f ${where}`);
    const totalRow = await (binds.length > 0 ? countStmt.bind(...binds) : countStmt).first<{ count: number }>();
    const total = totalRow?.count ?? 0;

    const listStmt = db.prepare(
      `SELECT f.* FROM friends f ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    );
    const listBinds = [...binds, limit, offset];
    const listResult = await listStmt.bind(...listBinds).all<DbFriend>();
    const items = listResult.results;

    // Fetch tags for each friend in parallel so the list response includes tags
    const itemsWithTags = await Promise.all(
      items.map(async (friend) => {
        const tags = await getFriendTags(db, friend.id);
        return { ...serializeFriend(friend), tags: tags.map(serializeTag) };
      }),
    );

    return c.json({
      success: true,
      data: {
        items: itemsWithTags,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasNextPage: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('GET /api/friends error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/count - friend count (must be before /:id)
friends.get('/api/friends/count', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    let count: number;
    if (lineAccountId) {
      const row = await c.env.DB.prepare('SELECT COUNT(*) as count FROM friends WHERE is_following = 1 AND line_account_id = ?')
        .bind(lineAccountId).first<{ count: number }>();
      count = row?.count ?? 0;
    } else {
      count = await getFriendCount(c.env.DB);
    }
    return c.json({ success: true, data: { count } });
  } catch (err) {
    console.error('GET /api/friends/count error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/ref-stats - ref code attribution stats
friends.get('/api/friends/ref-stats', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    const where = lineAccountId ? 'WHERE line_account_id = ?' : 'WHERE ref_code IS NOT NULL';
    const binds = lineAccountId ? [lineAccountId] : [];
    const stmt = c.env.DB.prepare(
      `SELECT ref_code, COUNT(*) as count FROM friends ${where} AND ref_code IS NOT NULL GROUP BY ref_code ORDER BY count DESC`,
    );
    const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{ ref_code: string; count: number }>();
    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM friends ${lineAccountId ? 'WHERE line_account_id = ?' : ''} ${lineAccountId ? 'AND' : 'WHERE'} ref_code IS NOT NULL`,
    ).bind(...(lineAccountId ? [lineAccountId] : [])).first<{ count: number }>();
    return c.json({
      success: true,
      data: {
        routes: result.results.map((r) => ({ refCode: r.ref_code, friendCount: r.count })),
        totalWithRef: total?.count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/friends/ref-stats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ============================================================
// GET /api/friends/export - CSV export with BOM for Excel
// ============================================================

const EXPORT_BATCH = 500;

/** Escape a value for CSV: wrap in double-quotes if it contains comma, quote, or newline */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

friends.get('/api/friends/export', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    const format = c.req.query('format') ?? 'csv';
    const filterTagId = c.req.query('tagId');
    const filterPhase = c.req.query('phase');

    if (!lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }

    if (format !== 'csv') {
      return c.json({ success: false, error: 'Unsupported format. Use format=csv' }, 400);
    }

    const db = c.env.DB;

    // Build query conditions
    const conditions: string[] = ['f.line_account_id = ?'];
    const binds: unknown[] = [lineAccountId];

    if (filterTagId) {
      conditions.push('EXISTS (SELECT 1 FROM friend_tags ft2 WHERE ft2.friend_id = f.id AND ft2.tag_id = ?)');
      binds.push(filterTagId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Get total count first
    const countRow = await db
      .prepare(`SELECT COUNT(*) as count FROM friends f ${where}`)
      .bind(...binds)
      .first<{ count: number }>();
    const total = countRow?.count ?? 0;

    if (total === 0) {
      // Return empty CSV with headers only
      const headers = ['LINE表示名', 'ユーザーID', '登録日時', 'タグ一覧', 'フェーズ', '最終メッセージ日時', 'ブロック状態'];
      const bom = '\uFEFF';
      const csv = bom + headers.map(csvEscape).join(',') + '\r\n';
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="friends_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // CSV header row
    const headerRow = ['LINE表示名', 'ユーザーID', '登録日時', 'タグ一覧', 'フェーズ', '最終メッセージ日時', 'ブロック状態'];
    const csvRows: string[] = [];
    // BOM for Excel UTF-8 detection
    csvRows.push('\uFEFF' + headerRow.map(csvEscape).join(','));

    // Fetch friends in batches to handle large datasets
    let offset = 0;
    while (offset < total) {
      const batchBinds = [...binds, EXPORT_BATCH, offset];
      const batchResult = await db
        .prepare(`SELECT f.* FROM friends f ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`)
        .bind(...batchBinds)
        .all<DbFriend>();
      const friendsBatch = batchResult.results;

      if (friendsBatch.length === 0) break;

      // Fetch tags and last message for each friend
      for (const friend of friendsBatch) {
        const friendTags = await getFriendTags(db, friend.id);
        const tagNames = friendTags.map((t) => t.name);

        // Extract phase from phase_* tags
        const phaseTag = tagNames.find((name) => name.startsWith('phase_'));
        const phase = phaseTag ? phaseTag.replace('phase_', '') : '';

        // Apply phase filter if specified
        if (filterPhase) {
          const normalizedFilter = filterPhase.startsWith('phase_') ? filterPhase : `phase_${filterPhase}`;
          if (!phaseTag || phaseTag !== normalizedFilter) {
            continue; // Skip - doesn't match phase filter
          }
        }

        // Get last message datetime
        const lastMsg = await db
          .prepare(
            `SELECT created_at FROM messages_log WHERE friend_id = ? ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(friend.id)
          .first<{ created_at: string }>();

        // Non-phase tags for the tag list
        const nonPhaseTags = tagNames.filter((name) => !name.startsWith('phase_'));

        const row = [
          friend.display_name || '',
          friend.line_user_id,
          friend.created_at || '',
          nonPhaseTags.join(', '),
          phase,
          lastMsg?.created_at || '',
          friend.is_following ? 'アクティブ' : 'ブロック',
        ];

        csvRows.push(row.map(csvEscape).join(','));
      }

      offset += EXPORT_BATCH;
    }

    const csvContent = csvRows.join('\r\n') + '\r\n';
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="friends_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error('GET /api/friends/export error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/:id - get single friend with tags
friends.get('/api/friends/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;

    const [friend, tags] = await Promise.all([
      getFriendById(db, id),
      getFriendTags(db, id),
    ]);

    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    return c.json({
      success: true,
      data: {
        ...serializeFriend(friend),
        tags: tags.map(serializeTag),
      },
    });
  } catch (err) {
    console.error('GET /api/friends/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/friends/:id/tags - add tag
friends.post('/api/friends/:id/tags', async (c) => {
  try {
    const friendId = c.req.param('id');
    const body = await c.req.json<{ tagId: string }>();

    if (!body.tagId) {
      return c.json({ success: false, error: 'tagId is required' }, 400);
    }

    const db = c.env.DB;
    await addTagToFriend(db, friendId, body.tagId);

    // Enroll in tag_added scenarios that match this tag
    const allScenarios = await getScenarios(db);
    for (const scenario of allScenarios) {
      if (scenario.trigger_type === 'tag_added' && scenario.is_active && scenario.trigger_tag_id === body.tagId) {
        const existing = await db
          .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
          .bind(friendId, scenario.id)
          .first();
        if (!existing) {
          await enrollFriendInScenario(db, friendId, scenario.id);
        }
      }
    }

    // イベントバス発火: tag_change
    await fireEvent(db, 'tag_change', { friendId, eventData: { tagId: body.tagId, action: 'add' } });

    return c.json({ success: true, data: null }, 201);
  } catch (err) {
    console.error('POST /api/friends/:id/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/friends/:id/tags/:tagId - remove tag
friends.delete('/api/friends/:id/tags/:tagId', async (c) => {
  try {
    const friendId = c.req.param('id');
    const tagId = c.req.param('tagId');

    await removeTagFromFriend(c.env.DB, friendId, tagId);

    // イベントバス発火: tag_change
    await fireEvent(c.env.DB, 'tag_change', { friendId, eventData: { tagId, action: 'remove' } });

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/friends/:id/tags/:tagId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/friends/:id/metadata - merge metadata fields
friends.put('/api/friends/:id/metadata', async (c) => {
  try {
    const friendId = c.req.param('id');
    const db = c.env.DB;

    const friend = await getFriendById(db, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const existing = JSON.parse(friend.metadata || '{}');
    const merged = { ...existing, ...body };
    const now = jstNow();

    await db
      .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(merged), now, friendId)
      .run();

    const updated = await getFriendById(db, friendId);
    const tags = await getFriendTags(db, friendId);

    return c.json({
      success: true,
      data: {
        ...serializeFriend(updated!),
        tags: tags.map(serializeTag),
      },
    });
  } catch (err) {
    console.error('PUT /api/friends/:id/metadata error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/:id/messages - get message history
friends.get('/api/friends/:id/messages', async (c) => {
  try {
    const friendId = c.req.param('id');
    const result = await c.env.DB
      .prepare(
        `SELECT id, direction, message_type as messageType, content, created_at as createdAt
         FROM messages_log WHERE friend_id = ? ORDER BY created_at ASC LIMIT 200`,
      )
      .bind(friendId)
      .all<{ id: string; direction: string; messageType: string; content: string; createdAt: string }>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/friends/:id/messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/friends/:id/messages - send message to friend
friends.post('/api/friends/:id/messages', async (c) => {
  try {
    const friendId = c.req.param('id');
    const body = await c.req.json<{
      messageType?: string;
      content: string;
    }>();

    if (!body.content) {
      return c.json({ success: false, error: 'content is required' }, 400);
    }

    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const { LineClient } = await import('@line-crm/line-sdk');
    // Resolve access token from friend's account (multi-account support)
    let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
    if ((friend as unknown as Record<string, unknown>).line_account_id) {
      const { getLineAccountById } = await import('@line-crm/db');
      const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
      if (account) accessToken = account.channel_access_token;
    }
    const lineClient = new LineClient(accessToken);
    const messageType = body.messageType ?? 'text';

    // Auto-wrap URLs with tracking links (text with URLs → Flex with button)
    const { autoTrackContent } = await import('../services/auto-track.js');
    const tracked = await autoTrackContent(
      db, messageType, body.content,
      c.env.WORKER_URL || new URL(c.req.url).origin,
    );

    const message = buildMessage(tracked.messageType, tracked.content);
    await lineClient.pushMessage(friend.line_user_id, [message]);

    // Log outgoing message
    const logId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, messageType, body.content, jstNow())
      .run();

    return c.json({ success: true, data: { messageId: logId } });
  } catch (err) {
    console.error('POST /api/friends/:id/messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ============================================================
// POST /api/friends/import - batch import friends with tags & metadata
// ============================================================

interface ImportRequestBody {
  friends: ImportFriendRow[];
  csv?: string; // raw CSV text (Lステップ export format)
  lineAccountId?: string; // required for multi-account
  addLegacyTag?: boolean; // auto-add "data_旧" tag (default: true)
}

const BATCH_SIZE = 100;

/** Normalize date string from Lステップ format to ISO-like format */
function normalizeDate(dateStr: string): string {
  // Handle "2025-01-01 10:00" or "2025/01/01 10:00:00" formats
  const cleaned = dateStr.replace(/\//g, '-').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned;
  }
  return jstNow(); // fallback
}

async function processBatch(
  db: D1Database,
  batch: ImportFriendRow[],
  tagCache: Map<string, string>,
  lineAccountId: string | null,
  legacyTagId: string | null,
): Promise<{ created: number; skipped: number; errors: string[] }> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of batch) {
    try {
      if (!row.line_user_id) {
        errors.push(`Missing line_user_id for entry: ${row.display_name || '(unknown)'}`);
        continue;
      }

      // Check if friend already exists - skip if so (don't overwrite live data)
      const existing = await getFriendByLineUserId(db, row.line_user_id);
      if (existing) {
        skipped++;
        continue;
      }

      // Create new friend
      const now = jstNow();
      const friendId = crypto.randomUUID();

      // Use registration_date from CSV if available, otherwise now
      const createdAt = row.registration_date
        ? normalizeDate(row.registration_date)
        : now;

      // Build metadata
      const metadata = row.metadata && Object.keys(row.metadata).length > 0
        ? JSON.stringify(row.metadata)
        : '{}';

      await db
        .prepare(
          `INSERT INTO friends (id, line_user_id, display_name, picture_url, status_message, is_following, line_account_id, metadata, created_at, updated_at)
           VALUES (?, ?, ?, NULL, NULL, 0, ?, ?, ?, ?)`,
        )
        .bind(
          friendId,
          row.line_user_id,
          row.display_name || null,
          lineAccountId,
          metadata,
          createdAt,
          now,
        )
        .run();

      created++;

      // Add "data_旧" tag for imported legacy data
      if (legacyTagId) {
        await addTagToFriend(db, friendId, legacyTagId);
      }

      // Process tags
      if (row.tags && row.tags.length > 0) {
        for (const tagName of row.tags) {
          const trimmed = tagName.trim();
          if (!trimmed) continue;

          let tagId = tagCache.get(trimmed);
          if (!tagId) {
            // Check if tag exists in DB
            const existingTag = await db
              .prepare('SELECT id FROM tags WHERE name = ?')
              .bind(trimmed)
              .first<{ id: string }>();

            if (existingTag) {
              tagId = existingTag.id;
            } else {
              // Auto-create tag
              const newTag = await createTag(db, { name: trimmed });
              tagId = newTag.id;
            }
            tagCache.set(trimmed, tagId);
          }

          await addTagToFriend(db, friendId, tagId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing ${row.line_user_id}: ${msg}`);
    }
  }

  return { created, skipped, errors };
}

friends.post('/api/friends/import', async (c) => {
  try {
    const body = await c.req.json<ImportRequestBody>();

    // lineAccountId for multi-account support
    const lineAccountId = body.lineAccountId || null;

    // Support both JSON array and raw CSV
    let rows: ImportFriendRow[];
    if (body.csv) {
      const parsed = parseLstepCsv(body.csv);
      rows = parsed.friends;
    } else if (body.friends && Array.isArray(body.friends)) {
      rows = body.friends;
    } else {
      return c.json({ success: false, error: 'Request must include "friends" array or "csv" string' }, 400);
    }

    if (rows.length === 0) {
      return c.json({ success: true, data: { created: 0, skipped: 0, errors: [] } });
    }

    const db = c.env.DB;

    // Pre-load all existing tags into cache to reduce DB queries
    const allTags = await getTags(db);
    const tagCache = new Map<string, string>();
    for (const t of allTags) {
      tagCache.set(t.name, t.id);
    }

    // Ensure "data_旧" legacy tag exists (per data generation separation decision)
    const addLegacyTag = body.addLegacyTag !== false; // default true
    let legacyTagId: string | null = null;
    if (addLegacyTag) {
      const legacyTagName = 'data_旧';
      let existingId = tagCache.get(legacyTagName);
      if (!existingId) {
        const existingTag = await db
          .prepare('SELECT id FROM tags WHERE name = ?')
          .bind(legacyTagName)
          .first<{ id: string }>();
        if (existingTag) {
          existingId = existingTag.id;
        } else {
          const newTag = await createTag(db, { name: legacyTagName, color: '#6B7280' });
          existingId = newTag.id;
        }
        tagCache.set(legacyTagName, existingId);
      }
      legacyTagId = existingId;
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

      console.log(`[import] Processing batch ${batchNum}/${totalBatches} (${batch.length} records)`);

      const result = await processBatch(db, batch, tagCache, lineAccountId, legacyTagId);
      totalCreated += result.created;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);

      console.log(
        `[import] Batch ${batchNum} done: created=${result.created}, skipped=${result.skipped}, errors=${result.errors.length}`,
      );
    }

    return c.json({
      success: true,
      data: {
        created: totalCreated,
        skipped: totalSkipped,
        total: rows.length,
        errors: allErrors,
      },
    });
  } catch (err) {
    console.error('POST /api/friends/import error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { friends };
