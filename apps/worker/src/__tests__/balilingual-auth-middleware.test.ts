import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

function makeApp(env: Record<string, unknown>) {
  const app = new Hono<{ Bindings: typeof env }>();
  app.use('*', authMiddleware as never);
  app.get('/api/protected', (c) => c.json({ ok: true }));
  return app;
}

describe('authMiddleware - dual key support', () => {
  it('accepts the main API_KEY', async () => {
    const env = { API_KEY: 'main-key', BALILINGUAL_HARNESS_API_KEY: 'bali-key' };
    const app = makeApp(env);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer main-key' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('accepts the BALILINGUAL_HARNESS_API_KEY', async () => {
    const env = { API_KEY: 'main-key', BALILINGUAL_HARNESS_API_KEY: 'bali-key' };
    const app = makeApp(env);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer bali-key' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('rejects unknown token', async () => {
    const env = { API_KEY: 'main-key', BALILINGUAL_HARNESS_API_KEY: 'bali-key' };
    const app = makeApp(env);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer wrong' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('rejects when BALILINGUAL_HARNESS_API_KEY is undefined but a value matching it would fail', async () => {
    const env = { API_KEY: 'main-key' };
    const app = makeApp(env);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer some-token' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('still accepts main API_KEY when BALILINGUAL_HARNESS_API_KEY is undefined', async () => {
    const env = { API_KEY: 'main-key' };
    const app = makeApp(env);
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer main-key' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('skips auth for webhook path', async () => {
    const env = { API_KEY: 'main-key' };
    const app = new Hono();
    app.use('*', authMiddleware as never);
    app.post('/webhook', (c) => c.json({ ok: true }));
    const res = await app.request('/webhook', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });
});
