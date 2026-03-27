import { Hono } from 'hono';
import {
  getFriendFields,
  createFriendField,
  updateFriendField,
  deleteFriendField,
} from '@line-crm/db';
import type { Env } from '../index.js';

const friendFields = new Hono<Env>();

// GET /api/friend-fields?lineAccountId=xxx
friendFields.get('/api/friend-fields', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    if (!lineAccountId) return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    const items = await getFriendFields(c.env.DB, lineAccountId);
    return c.json({ success: true, data: items });
  } catch (err) {
    console.error('GET /api/friend-fields error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/friend-fields
friendFields.post('/api/friend-fields', async (c) => {
  try {
    const body = await c.req.json<{
      lineAccountId: string;
      name: string;
      fieldKey: string;
      fieldType?: string;
      options?: string | null;
      sortOrder?: number;
      isRequired?: number;
    }>();
    if (!body.lineAccountId || !body.name || !body.fieldKey) {
      return c.json({ success: false, error: 'lineAccountId, name, and fieldKey are required' }, 400);
    }
    const field = await createFriendField(
      c.env.DB, body.lineAccountId, body.name, body.fieldKey,
      body.fieldType, body.options, body.sortOrder, body.isRequired,
    );
    return c.json({ success: true, data: field }, 201);
  } catch (err) {
    console.error('POST /api/friend-fields error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/friend-fields/:id
friendFields.put('/api/friend-fields/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      fieldKey?: string;
      fieldType?: string;
      options?: string | null;
      sortOrder?: number;
      isRequired?: number;
    }>();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.fieldKey !== undefined) updates.field_key = body.fieldKey;
    if (body.fieldType !== undefined) updates.field_type = body.fieldType;
    if (body.options !== undefined) updates.options = body.options;
    if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;
    if (body.isRequired !== undefined) updates.is_required = body.isRequired;
    const field = await updateFriendField(c.env.DB, id, updates);
    if (!field) return c.json({ success: false, error: 'Field not found' }, 404);
    return c.json({ success: true, data: field });
  } catch (err) {
    console.error('PUT /api/friend-fields/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/friend-fields/:id
friendFields.delete('/api/friend-fields/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteFriendField(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/friend-fields/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { friendFields };
