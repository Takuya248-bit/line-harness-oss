import { Hono } from 'hono';
import { cors } from 'hono/cors';
import uiHtml from './ui/index.html';
import { invoices } from './routes/invoices.js';
import { extract } from './routes/extract.js';
import { pdf } from './routes/pdf.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    INVOICE_BUCKET: R2Bucket;
    NOTION_API_KEY: string;
    NOTION_DB_ID: string;
    ANTHROPIC_API_KEY: string;
    API_KEY: string;
  };
};

const app = new Hono<Env>();

app.use('*', cors({ origin: '*' }));

app.get('/', (c) => c.html(uiHtml));

app.use('/api/*', async (c, next) => {
  const key = c.req.header('X-API-Key') || new URL(c.req.url).searchParams.get('key');
  if (key !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('', pdf);
app.route('', invoices);
app.route('', extract);

export default app;
