import { Hono } from 'hono';
import type { Env, FollowerHistory } from '../types';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    userEmail: string;
    userRole: 'admin' | 'client';
  };
};

const followers = new Hono<AuthEnv>();

// Follower history
followers.get('/', async (c) => {
  const days = parseInt(c.req.query('days') ?? '30', 10);

  const result = await c.env.DB.prepare(
    `SELECT * FROM follower_history
     WHERE recorded_at >= datetime('now', ?)
     ORDER BY recorded_at ASC`
  ).bind(`-${days} days`).all<FollowerHistory>();

  return c.json({ followers: result.results });
});

// Ingest follower count
followers.post('/ingest', async (c) => {
  const body = await c.req.json<{ count: number }>();

  await c.env.DB.prepare(
    `INSERT INTO follower_history (count) VALUES (?)`
  ).bind(body.count).run();

  return c.json({ ok: true }, 201);
});

export default followers;
