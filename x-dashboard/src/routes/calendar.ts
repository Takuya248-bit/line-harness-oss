import { Hono } from 'hono';
import type { Env, Post } from '../types';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    userEmail: string;
    userRole: 'admin' | 'client';
  };
};

const calendar = new Hono<AuthEnv>();

// Calendar view
calendar.get('/', async (c) => {
  const month = c.req.query('month');
  if (!month) return c.json({ error: 'month parameter required (YYYY-MM)' }, 400);

  const startDate = `${month}-01`;
  const endDate = `${month}-31 23:59:59`;

  // Thread heads and standalone posts
  const postsResult = await c.env.DB.prepare(
    `SELECT * FROM posts
     WHERE (thread_id IS NULL OR thread_order = 0)
       AND COALESCE(scheduled_at, created_at) >= ?
       AND COALESCE(scheduled_at, created_at) <= ?
     ORDER BY COALESCE(scheduled_at, created_at) ASC`
  ).bind(startDate, endDate).all<Post>();

  // Thread children for any threads in the results
  const threadIds = postsResult.results
    .filter((p) => p.thread_id !== null)
    .map((p) => p.thread_id);

  let threadChildren: Post[] = [];
  if (threadIds.length > 0) {
    const placeholders = threadIds.map(() => '?').join(',');
    const childrenResult = await c.env.DB.prepare(
      `SELECT * FROM posts
       WHERE thread_id IN (${placeholders})
         AND thread_order > 0
       ORDER BY thread_id, thread_order ASC`
    ).bind(...threadIds).all<Post>();
    threadChildren = childrenResult.results;
  }

  return c.json({ posts: postsResult.results, threadChildren });
});

export default calendar;
