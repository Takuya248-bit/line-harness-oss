import { Hono } from 'hono';
import type { Env, Keyword, CaseStudy } from './types';
import { runPipeline } from './pipeline';
import { insertCaseStudy } from './case-studies';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'seo-writer', timestamp: new Date().toISOString() });
});

// Auth middleware for API routes
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  await next();
});

// Manual trigger: generate articles
app.post('/api/generate', async (c) => {
  const body = await c.req.json<{ limit?: number }>().catch(() => ({ limit: 1 }));
  const limit = body.limit ?? 1;
  const results = await runPipeline(c.env, limit);
  return c.json({ success: true, results });
});

// Add keyword(s)
app.post('/api/keywords', async (c) => {
  const body = await c.req.json<{
    keywords: Array<{ keyword: string; search_intent: string; priority?: number }>;
  }>();

  const added: string[] = [];
  for (const kw of body.keywords) {
    await c.env.DB.prepare(
      'INSERT INTO seo_keywords (keyword, search_intent, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(), datetime())'
    ).bind(kw.keyword, kw.search_intent, 'pending', kw.priority || 0).run();
    added.push(kw.keyword);
  }

  return c.json({ success: true, added });
});

// List keywords
app.get('/api/keywords', async (c) => {
  const status = c.req.query('status');
  let query = 'SELECT * FROM seo_keywords';
  const params: string[] = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY priority DESC, created_at DESC';

  const stmt = c.env.DB.prepare(query);
  const { results } = params.length ? await stmt.bind(...params).all<Keyword>() : await stmt.all<Keyword>();
  return c.json({ success: true, keywords: results });
});

// Add case study
app.post('/api/case-studies', async (c) => {
  const body = await c.req.json<{
    business_name: string;
    industry: string;
    challenge: string;
    solution: string;
    result: string;
    quote?: string;
    metrics_json?: string;
    is_anonymized?: boolean;
  }>();

  if (!body.business_name || !body.industry || !body.challenge || !body.solution || !body.result) {
    return c.json({ success: false, error: 'Missing required fields: business_name, industry, challenge, solution, result' }, 400);
  }

  const id = await insertCaseStudy(c.env, body);
  return c.json({ success: true, id });
});

// List case studies
app.get('/api/case-studies', async (c) => {
  const industry = c.req.query('industry');
  let query = 'SELECT * FROM case_studies';
  const params: string[] = [];
  if (industry) {
    query += ' WHERE industry = ?';
    params.push(industry);
  }
  query += ' ORDER BY created_at DESC';

  const stmt = c.env.DB.prepare(query);
  const { results } = params.length ? await stmt.bind(...params).all<CaseStudy>() : await stmt.all<CaseStudy>();
  return c.json({ success: true, case_studies: results });
});

// List articles
app.get('/api/articles', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, keyword_id, title, slug, status, wp_post_id, word_count, created_at FROM seo_articles ORDER BY created_at DESC'
  ).all();
  return c.json({ success: true, articles: results });
});

// Cron handler
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const results = await runPipeline(env, 1);
        console.log('SEO Writer cron:', results);
      })()
    );
  },
};
