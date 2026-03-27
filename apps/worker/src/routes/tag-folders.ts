import { Hono } from 'hono';
import {
  getTagFolders,
  createTagFolder,
  updateTagFolder,
  deleteTagFolder,
  moveTagToFolder,
} from '@line-crm/db';
import type { TagFolder as DbTagFolder } from '@line-crm/db';
import type { Env } from '../index.js';

const tagFolders = new Hono<Env>();

function serializeTagFolder(row: DbTagFolder) {
  return {
    id: row.id,
    name: row.name,
    lineAccountId: row.line_account_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// GET /api/tag-folders
tagFolders.get('/api/tag-folders', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    if (!lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }
    const folders = await getTagFolders(c.env.DB, lineAccountId);
    return c.json({ success: true, data: folders.map(serializeTagFolder) });
  } catch (err) {
    console.error('GET /api/tag-folders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tag-folders
tagFolders.post('/api/tag-folders', async (c) => {
  try {
    const body = await c.req.json<{ name: string; lineAccountId: string }>();
    if (!body.name || !body.lineAccountId) {
      return c.json({ success: false, error: 'name and lineAccountId are required' }, 400);
    }
    const folder = await createTagFolder(c.env.DB, body.lineAccountId, body.name);
    return c.json({ success: true, data: serializeTagFolder(folder) }, 201);
  } catch (err) {
    console.error('POST /api/tag-folders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/tag-folders/:id
tagFolders.put('/api/tag-folders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name: string; sortOrder?: number }>();
    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }
    const folder = await updateTagFolder(c.env.DB, id, body.name, body.sortOrder ?? 0);
    if (!folder) {
      return c.json({ success: false, error: 'Folder not found' }, 404);
    }
    return c.json({ success: true, data: serializeTagFolder(folder) });
  } catch (err) {
    console.error('PUT /api/tag-folders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tag-folders/:id
tagFolders.delete('/api/tag-folders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteTagFolder(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tag-folders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/tags/:tagId/folder - move tag to folder
tagFolders.put('/api/tags/:tagId/folder', async (c) => {
  try {
    const tagId = c.req.param('tagId');
    const body = await c.req.json<{ folderId: string | null }>();
    await moveTagToFolder(c.env.DB, tagId, body.folderId ?? null);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PUT /api/tags/:tagId/folder error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { tagFolders };
