import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  duplicateInvoice,
} from '../services/notion.js';

export const invoices = new Hono<Env>();

invoices.get('/api/invoices', async (c) => {
  const type = c.req.query('type');
  const status = c.req.query('status');
  const data = await listInvoices(c.env, type ?? undefined, status ?? undefined);
  return c.json({ success: true, data });
});

invoices.get('/api/invoices/:id', async (c) => {
  const data = await getInvoice(c.env, c.req.param('id'));
  return c.json({ success: true, data });
});

invoices.post('/api/invoices', async (c) => {
  const body = await c.req.json();
  const data = await createInvoice(c.env, body);
  return c.json({ success: true, data }, 201);
});

invoices.put('/api/invoices/:id', async (c) => {
  const body = await c.req.json();
  const data = await updateInvoice(c.env, c.req.param('id'), body);
  return c.json({ success: true, data });
});

invoices.delete('/api/invoices/:id', async (c) => {
  const invoice = await getInvoice(c.env, c.req.param('id'));
  if (invoice.status !== 'draft') {
    return c.json({ error: '下書き以外は削除できません' }, 400);
  }
  await deleteInvoice(c.env, c.req.param('id'));
  return c.json({ success: true });
});

invoices.post('/api/invoices/:id/duplicate', async (c) => {
  const { type } = await c.req.json<{ type: 'estimate' | 'invoice' }>();
  const data = await duplicateInvoice(c.env, c.req.param('id'), type);
  return c.json({ success: true, data }, 201);
});
