import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import posts from './routes/posts';
import metrics from './routes/metrics';
import followers from './routes/followers';
import calendar from './routes/calendar';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());
app.use('/api/*', authMiddleware);

app.get('/', (c) => c.json({ status: 'ok' }));

app.route('/api/posts', posts);
app.route('/api/metrics', metrics);
app.route('/api/followers', followers);
app.route('/api/calendar', calendar);

export default app;
