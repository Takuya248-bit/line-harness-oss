import { Hono } from 'hono';
import {
  getSavedFilters,
  getSavedFilterById,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from '@line-crm/db';
import type { Env } from '../index.js';

const savedFilters = new Hono<Env>();

// GET /api/saved-filters?lineAccountId=xxx
savedFilters.get('/api/saved-filters', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    if (!lineAccountId) return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    const items = await getSavedFilters(c.env.DB, lineAccountId);
    return c.json({ success: true, data: items });
  } catch (err) {
    console.error('GET /api/saved-filters error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/saved-filters/:id
savedFilters.get('/api/saved-filters/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const filter = await getSavedFilterById(c.env.DB, id);
    if (!filter) return c.json({ success: false, error: 'Filter not found' }, 404);
    return c.json({ success: true, data: filter });
  } catch (err) {
    console.error('GET /api/saved-filters/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/saved-filters
savedFilters.post('/api/saved-filters', async (c) => {
  try {
    const body = await c.req.json<{
      lineAccountId: string;
      name: string;
      filterConditions: string;
    }>();
    if (!body.lineAccountId || !body.name || !body.filterConditions) {
      return c.json({ success: false, error: 'lineAccountId, name, and filterConditions are required' }, 400);
    }
    const filter = await createSavedFilter(c.env.DB, body.lineAccountId, body.name, body.filterConditions);
    return c.json({ success: true, data: filter }, 201);
  } catch (err) {
    console.error('POST /api/saved-filters error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/saved-filters/:id
savedFilters.put('/api/saved-filters/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; filterConditions?: string }>();
    const filter = await updateSavedFilter(c.env.DB, id, body.name, body.filterConditions);
    if (!filter) return c.json({ success: false, error: 'Filter not found' }, 404);
    return c.json({ success: true, data: filter });
  } catch (err) {
    console.error('PUT /api/saved-filters/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/saved-filters/:id
savedFilters.delete('/api/saved-filters/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteSavedFilter(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/saved-filters/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { savedFilters };
