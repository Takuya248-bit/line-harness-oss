import type { Context, Next } from 'hono';
import type { Env, UserRole } from '../types';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    userEmail: string;
    userRole: UserRole;
  };
};

export async function authMiddleware(c: Context<AuthEnv>, next: Next) {
  const email = c.req.header('Cf-Access-Authenticated-User-Email');
  // TODO: Cloudflare Access設定後にこのバイパスを削除
  if (!email) {
    c.set('userEmail', 'admin@bypass');
    c.set('userRole', 'admin' as UserRole);
    await next();
    return;
  }
  const adminEmail = c.env.ADMIN_EMAIL;
  const role: UserRole = email === adminEmail ? 'admin' : 'client';
  c.set('userEmail', email);
  c.set('userRole', role);
  await next();
}

export function requireAdmin(c: Context<AuthEnv>, next: Next) {
  if (c.get('userRole') !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
}
