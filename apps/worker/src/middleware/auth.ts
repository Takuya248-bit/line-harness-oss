import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  // Skip auth for the LINE webhook endpoint — it uses signature verification instead
  // Skip auth for OpenAPI docs — public documentation
  const path = new URL(c.req.url).pathname;
  if (
    path === '/webhook' ||
    path === '/health' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path.startsWith('/t/') ||
    path.startsWith('/r/') ||
    path.startsWith('/go/') ||
    path.startsWith('/api/liff/') ||
    path.startsWith('/auth/') ||
    path === '/api/os/intake' ||
    path.startsWith('/api/os/') ||
    path === '/api/bali-ryugaku-center/diagnosis-complete' ||
    path === '/discord/interactions' ||
    path === '/telegram/webhook' ||
    path === '/api/integrations/stripe/webhook' ||
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) // GET form definition (public for LIFF)
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  // バリリンガル本体専用API_KEY も受け付ける(他システムへの影響を避けつつ
  // バリリンガル v4 スクリプト群が独立した認可キーで動けるようにする).
  const balilingualKey = (c.env as { BALILINGUAL_HARNESS_API_KEY?: string }).BALILINGUAL_HARNESS_API_KEY;
  const isValid = token === c.env.API_KEY || (balilingualKey && token === balilingualKey);
  if (!isValid) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
