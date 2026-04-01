import { Hono } from 'hono';
import type { Env } from '../index.js';
import { getInvoice, updateInvoice } from '../services/notion.js';
import { generateInvoicePDF } from '../services/pdf-generator.js';

export const pdf = new Hono<Env>();

pdf.get('/api/invoices/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const invoice = await getInvoice(c.env, id);

  const r2Key = `invoices/${invoice.invoice_number}.pdf`;
  const cached = await c.env.INVOICE_BUCKET.get(r2Key);
  if (cached?.body) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  }

  const pdfBuffer = generateInvoicePDF(invoice);

  await c.env.INVOICE_BUCKET.put(r2Key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  const pdfUrl = `${new URL(c.req.url).origin}/api/invoices/${id}/pdf?key=${encodeURIComponent(c.env.API_KEY)}`;
  await updateInvoice(c.env, id, { pdf_url: pdfUrl });

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
});

pdf.post('/api/invoices/:id/pdf/regenerate', async (c) => {
  const id = c.req.param('id');
  const invoice = await getInvoice(c.env, id);
  const r2Key = `invoices/${invoice.invoice_number}.pdf`;

  await c.env.INVOICE_BUCKET.delete(r2Key);

  const pdfBuffer = generateInvoicePDF(invoice);
  await c.env.INVOICE_BUCKET.put(r2Key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  return c.json({ success: true, message: 'PDF regenerated' });
});
