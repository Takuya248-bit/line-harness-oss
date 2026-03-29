import { Hono } from 'hono';
import {
  getXPosts,
  getXPostById,
  createXPost,
  updateXPost,
  deleteXPost,
  getXPostTemplates,
  getXPostTemplateById,
  createXPostTemplate,
  getXPostLogs,
} from '@line-crm/db';
import type { XPost, XPostTemplate, XPostCategory, XPostCtaType } from '@line-crm/db';
import { generateXPostContent, generateAIContent, scheduleWeeklyPosts } from '../services/x-content-generator.js';
import { processXPosting } from '../services/x-posting.js';
import { XApiClient } from '../lib/x-api.js';
import type { Env } from '../index.js';

const xPosts = new Hono<Env>();

// ---------------------------------------------------------------------------
// Posts CRUD
// ---------------------------------------------------------------------------

// GET /api/x-posts - list posts
xPosts.get('/api/x-posts', async (c) => {
  try {
    const status = c.req.query('status') as XPost['status'] | undefined;
    const category = c.req.query('category') as XPostCategory | undefined;
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const items = await getXPosts(c.env.DB, { status, category, limit });
    return c.json({ success: true, data: items });
  } catch (err) {
    console.error('GET /api/x-posts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/x-posts/:id
xPosts.get('/api/x-posts/:id', async (c) => {
  try {
    const post = await getXPostById(c.env.DB, c.req.param('id'));
    if (!post) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: post });
  } catch (err) {
    console.error('GET /api/x-posts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/x-posts - create post
xPosts.post('/api/x-posts', async (c) => {
  try {
    const body = await c.req.json<{
      content: string;
      imageUrl?: string;
      postType?: string;
      threadParentId?: string;
      scheduledAt?: string;
      category?: string;
      ctaType?: string;
    }>();
    const post = await createXPost(c.env.DB, {
      content: body.content,
      imageUrl: body.imageUrl,
      postType: (body.postType || 'single') as XPost['post_type'],
      threadParentId: body.threadParentId,
      scheduledAt: body.scheduledAt,
      category: body.category as XPostCategory | undefined,
      ctaType: (body.ctaType || 'none') as XPostCtaType,
    });
    return c.json({ success: true, data: post }, 201);
  } catch (err) {
    console.error('POST /api/x-posts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/x-posts/:id - update post
xPosts.put('/api/x-posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getXPostById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    if (existing.status === 'posted') {
      return c.json({ success: false, error: 'Cannot edit posted content' }, 400);
    }
    const body = await c.req.json();
    const updated = await updateXPost(c.env.DB, id, body);
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/x-posts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/x-posts/:id
xPosts.delete('/api/x-posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getXPostById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    await deleteXPost(c.env.DB, id);
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/x-posts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/x-posts/:id/logs - get post logs
xPosts.get('/api/x-posts/:id/logs', async (c) => {
  try {
    const logs = await getXPostLogs(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: logs });
  } catch (err) {
    console.error('GET /api/x-posts/:id/logs error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// GET /api/x-templates
xPosts.get('/api/x-templates', async (c) => {
  try {
    const category = c.req.query('category') as XPostCategory | undefined;
    const items = await getXPostTemplates(c.env.DB, category);
    return c.json({ success: true, data: items });
  } catch (err) {
    console.error('GET /api/x-templates error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/x-templates
xPosts.post('/api/x-templates', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      category: string;
      templateText: string;
      ctaType?: string;
      variables?: string;
    }>();
    const template = await createXPostTemplate(c.env.DB, {
      name: body.name,
      category: body.category as XPostCategory,
      templateText: body.templateText,
      ctaType: (body.ctaType || 'line') as XPostCtaType,
      variables: body.variables,
    });
    return c.json({ success: true, data: template }, 201);
  } catch (err) {
    console.error('POST /api/x-templates error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// POST /api/x-posts/generate - AI or template-based content generation
xPosts.post('/api/x-posts/generate', async (c) => {
  try {
    const body = await c.req.json<{
      category?: string;
      ctaType?: string;
      useAi?: boolean;
    }>();

    if (body.useAi) {
      const apiKey = c.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return c.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, 500);
      }
      const { content } = await generateAIContent(
        c.env.DB,
        apiKey,
        (body.category || 'ai_tips') as XPostCategory,
      );
      return c.json({ success: true, data: { content, aiGenerated: true } });
    }

    const result = await generateXPostContent(c.env.DB, {
      category: body.category as XPostCategory | undefined,
    });
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('POST /api/x-posts/generate error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/x-posts/schedule-week - schedule a week of posts
xPosts.post('/api/x-posts/schedule-week', async (c) => {
  try {
    const body = await c.req.json<{
      postsPerDay?: number;
      startHour?: number;
      endHour?: number;
    }>().catch(() => ({}));
    await scheduleWeeklyPosts(c.env.DB, body);
    return c.json({ success: true, message: 'Weekly posts scheduled' });
  } catch (err) {
    console.error('POST /api/x-posts/schedule-week error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/x-posts/:id/post-now - immediately post to X
xPosts.post('/api/x-posts/:id/post-now', async (c) => {
  try {
    const xConfig = {
      apiKey: c.env.X_API_KEY,
      apiSecret: c.env.X_API_SECRET,
      accessToken: c.env.X_ACCESS_TOKEN,
      accessSecret: c.env.X_ACCESS_SECRET,
    };
    if (!xConfig.apiKey || !xConfig.accessToken) {
      return c.json({ success: false, error: 'X API credentials not configured' }, 500);
    }

    const id = c.req.param('id');
    const post = await getXPostById(c.env.DB, id);
    if (!post) return c.json({ success: false, error: 'Not found' }, 404);
    if (post.status === 'posted') {
      return c.json({ success: false, error: 'Already posted' }, 400);
    }

    const client = new XApiClient(xConfig);
    const result = await client.createTweet(post.content);
    const { updateXPostStatus, createXPostLog } = await import('@line-crm/db');
    await updateXPostStatus(c.env.DB, id, 'posted', result.id);
    await createXPostLog(c.env.DB, id, 'created', `Manual post: ${result.id}`);
    return c.json({ success: true, data: { xPostId: result.id } });
  } catch (err: any) {
    console.error('POST /api/x-posts/:id/post-now error:', err);
    return c.json({ success: false, error: err.message || 'Post failed' }, 500);
  }
});

export { xPosts };
