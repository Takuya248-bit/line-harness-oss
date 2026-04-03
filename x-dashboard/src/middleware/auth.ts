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
  if (!email) {
    return c.json({ error: 'Unauthorized' }, 401);
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
