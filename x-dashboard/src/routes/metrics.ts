import { Hono } from 'hono';
import type { Env } from '../types';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    userEmail: string;
    userRole: 'admin' | 'client';
  };
};

const metrics = new Hono<AuthEnv>();

// Summary metrics
metrics.get('/summary', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7', 10);

  const result = await c.env.DB.prepare(
    `SELECT
       SUM(m.impressions) as total_impressions,
       SUM(m.likes) as total_likes,
       SUM(m.retweets) as total_retweets,
       SUM(m.replies) as total_replies,
       COUNT(DISTINCT m.post_id) as post_count
     FROM metrics m
     INNER JOIN (
       SELECT post_id, MAX(id) as max_id
       FROM metrics
       WHERE collected_at >= datetime('now', ?)
       GROUP BY post_id
     ) latest ON m.id = latest.max_id`
  ).bind(`-${days} days`).first();

  return c.json({ summary: result });
});

// Per-post metrics
metrics.get('/posts', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7', 10);

  const result = await c.env.DB.prepare(
    `SELECT p.id, p.content, p.posted_at, p.tweet_id,
            m.impressions, m.likes, m.retweets, m.replies, m.collected_at
     FROM posts p
     INNER JOIN metrics m ON m.post_id = p.id
     INNER JOIN (
       SELECT post_id, MAX(id) as max_id
       FROM metrics
       WHERE collected_at >= datetime('now', ?)
       GROUP BY post_id
     ) latest ON m.id = latest.max_id
     WHERE p.status = 'posted'
     ORDER BY m.likes DESC`
  ).bind(`-${days} days`).all();

  return c.json({ posts: result.results });
});

// Ingest metric
metrics.post('/ingest', async (c) => {
  const body = await c.req.json<{
    post_id: string;
    impressions: number;
    likes: number;
    retweets: number;
    replies: number;
  }>();

  await c.env.DB.prepare(
    `INSERT INTO metrics (post_id, impressions, likes, retweets, replies)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(body.post_id, body.impressions, body.likes, body.retweets, body.replies).run();

  return c.json({ ok: true }, 201);
});

export default metrics;
