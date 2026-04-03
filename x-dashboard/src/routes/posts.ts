import { Hono } from 'hono';
import type { Env, Post } from '../types';
import { requireAdmin } from '../middleware/auth';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    userEmail: string;
    userRole: 'admin' | 'client';
  };
};

const posts = new Hono<AuthEnv>();

// List posts
posts.get('/', async (c) => {
  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');

  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params: string[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (from) {
    sql += ' AND COALESCE(scheduled_at, created_at) >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND COALESCE(scheduled_at, created_at) <= ?';
    params.push(to);
  }

  sql += ' ORDER BY COALESCE(scheduled_at, created_at) DESC';

  const result = await c.env.DB.prepare(sql).bind(...params).all<Post>();
  return c.json({ posts: result.results });
});

// Create post (admin only)
posts.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<{
    content: string;
    media_urls?: string | null;
    scheduled_at?: string | null;
    thread_items?: Array<{
      content: string;
      media_urls?: string | null;
    }>;
  }>();

  const now = new Date().toISOString();

  // Thread post
  if (body.thread_items && body.thread_items.length > 0) {
    const headId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];

    // Head post
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO posts (id, content, media_urls, status, thread_id, thread_order, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, 0, ?, ?, ?)`
      ).bind(headId, body.content, body.media_urls ?? null, headId, body.scheduled_at ?? null, now, now)
    );

    // Thread children
    for (let i = 0; i < body.thread_items.length; i++) {
      const item = body.thread_items[i];
      const childId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO posts (id, content, media_urls, status, thread_id, thread_order, scheduled_at, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
        ).bind(childId, item.content, item.media_urls ?? null, headId, i + 1, body.scheduled_at ?? null, now, now)
      );
    }

    await c.env.DB.batch(statements);
    const allPosts = await c.env.DB.prepare('SELECT * FROM posts WHERE thread_id = ? ORDER BY thread_order ASC').bind(headId).all<Post>();
    return c.json({ posts: allPosts.results }, 201);
  }

  // Single post
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO posts (id, content, media_urls, status, scheduled_at, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`
  ).bind(id, body.content, body.media_urls ?? null, body.scheduled_at ?? null, now, now).run();

  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  return c.json({ post }, 201);
});

// Edit post (admin only, draft/rejected only)
posts.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'draft' && existing.status !== 'rejected') {
    return c.json({ error: 'Can only edit draft or rejected posts' }, 400);
  }

  const body = await c.req.json<{
    content?: string;
    media_urls?: string | null;
    scheduled_at?: string | null;
  }>();

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE posts SET content = ?, media_urls = ?, scheduled_at = ?, updated_at = ? WHERE id = ?`
  ).bind(
    body.content ?? existing.content,
    body.media_urls !== undefined ? body.media_urls : existing.media_urls,
    body.scheduled_at !== undefined ? body.scheduled_at : existing.scheduled_at,
    now,
    id
  ).run();

  const updated = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  return c.json({ post: updated });
});

// Delete post (admin only, draft only)
posts.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only delete draft posts' }, 400);
  }

  if (existing.thread_id) {
    await c.env.DB.prepare('DELETE FROM posts WHERE thread_id = ?').bind(existing.thread_id).run();
  } else {
    await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  }

  return c.json({ ok: true });
});

// Submit for approval (admin only, draft → pending_approval)
posts.post('/:id/submit', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'draft') {
    return c.json({ error: 'Can only submit draft posts' }, 400);
  }

  const now = new Date().toISOString();
  if (existing.thread_id) {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'pending_approval', updated_at = ? WHERE thread_id = ?`
    ).bind(now, existing.thread_id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'pending_approval', updated_at = ? WHERE id = ?`
    ).bind(now, id).run();
  }

  return c.json({ ok: true });
});

// Approve (any user, pending_approval → approved)
posts.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'pending_approval') {
    return c.json({ error: 'Can only approve pending posts' }, 400);
  }

  const now = new Date().toISOString();
  if (existing.thread_id) {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'approved', updated_at = ? WHERE thread_id = ?`
    ).bind(now, existing.thread_id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'approved', updated_at = ? WHERE id = ?`
    ).bind(now, id).run();
  }

  return c.json({ ok: true });
});

// Reject (any user, pending_approval → rejected)
posts.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'pending_approval') {
    return c.json({ error: 'Can only reject pending posts' }, 400);
  }

  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const now = new Date().toISOString();

  if (existing.thread_id) {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE thread_id = ?`
    ).bind(body.reason ?? null, now, existing.thread_id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE posts SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?`
    ).bind(body.reason ?? null, now, id).run();
  }

  return c.json({ ok: true });
});

export default posts;
