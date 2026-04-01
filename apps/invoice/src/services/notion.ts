import type { Env } from '../index.js';

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Invoice {
  id: string;
  type: 'estimate' | 'invoice';
  status: 'draft' | 'sent' | 'paid';
  invoice_number: string;
  recipient_name: string;
  friend_id: string | null;
  issued_date: string;
  total: number;
  items: InvoiceItem[];
  notes: string;
  pdf_url: string | null;
  chat_summary: string | null;
  created_at: string;
}

type NotionEnv = Pick<Env['Bindings'], 'NOTION_API_KEY' | 'NOTION_DB_ID'>;

const NOTION_API = 'https://api.notion.com/v1';

async function notionFetch(env: NotionEnv, path: string, options: RequestInit = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API error ${res.status}: ${body}`);
  }
  return res.json();
}

function parseItems(raw: string): InvoiceItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pageToInvoice(page: any): Invoice {
  const props = page.properties;
  return {
    id: page.id,
    type: props['種別']?.select?.name === '見積書' ? 'estimate' : 'invoice',
    status:
      props['ステータス']?.select?.name === '入金済'
        ? 'paid'
        : props['ステータス']?.select?.name === '送付済'
          ? 'sent'
          : 'draft',
    invoice_number: props['タイトル']?.title?.[0]?.plain_text || '',
    recipient_name: props['宛名']?.rich_text?.[0]?.plain_text || '',
    friend_id: props['friend_id']?.rich_text?.[0]?.plain_text || null,
    issued_date: props['発行日']?.date?.start || '',
    total: props['合計金額']?.number || 0,
    items: parseItems(props['品目JSON']?.rich_text?.[0]?.plain_text || '[]'),
    notes: props['備考']?.rich_text?.[0]?.plain_text || '',
    pdf_url: props['PDF URL']?.url || null,
    chat_summary: props['元チャット要約']?.rich_text?.[0]?.plain_text || null,
    created_at: page.created_time,
  };
}

export async function generateInvoiceNumber(env: NotionEnv): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result: any = await notionFetch(env, `/databases/${env.NOTION_DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        property: 'タイトル',
        title: { starts_with: today },
      },
    }),
  });
  const seq = String(result.results.length + 1).padStart(3, '0');
  return `${today}-${seq}`;
}

export async function listInvoices(env: NotionEnv, type?: string, status?: string): Promise<Invoice[]> {
  const filters: any[] = [];
  if (type) {
    filters.push({
      property: '種別',
      select: { equals: type === 'estimate' ? '見積書' : '請求書' },
    });
  }
  if (status) {
    const map: Record<string, string> = { draft: '下書き', sent: '送付済', paid: '入金済' };
    filters.push({ property: 'ステータス', select: { equals: map[status] || status } });
  }

  const body: any = {
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 100,
  };
  if (filters.length > 0) {
    body.filter = filters.length === 1 ? filters[0] : { and: filters };
  }

  const result: any = await notionFetch(env, `/databases/${env.NOTION_DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return result.results.map(pageToInvoice);
}

export async function getInvoice(env: NotionEnv, id: string): Promise<Invoice> {
  const page: any = await notionFetch(env, `/pages/${id}`);
  return pageToInvoice(page);
}

export async function createInvoice(
  env: NotionEnv,
  data: {
    type: 'estimate' | 'invoice';
    recipient_name: string;
    friend_id?: string;
    issued_date: string;
    items: InvoiceItem[];
    notes: string;
    chat_summary?: string;
  },
): Promise<Invoice> {
  const number = await generateInvoiceNumber(env);
  const total = data.items.reduce((sum, item) => sum + item.amount, 0);
  const typeLabel = data.type === 'estimate' ? '見積書' : '請求書';

  const page: any = await notionFetch(env, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DB_ID },
      properties: {
        タイトル: { title: [{ text: { content: number } }] },
        種別: { select: { name: typeLabel } },
        ステータス: { select: { name: '下書き' } },
        宛名: { rich_text: [{ text: { content: data.recipient_name } }] },
        friend_id: { rich_text: [{ text: { content: data.friend_id || '' } }] },
        発行日: { date: { start: data.issued_date } },
        合計金額: { number: total },
        品目JSON: { rich_text: [{ text: { content: JSON.stringify(data.items) } }] },
        備考: { rich_text: [{ text: { content: data.notes } }] },
        元チャット要約: { rich_text: [{ text: { content: data.chat_summary || '' } }] },
      },
    }),
  });
  return pageToInvoice(page);
}

export async function updateInvoice(
  env: NotionEnv,
  id: string,
  data: Partial<{
    status: 'draft' | 'sent' | 'paid';
    recipient_name: string;
    issued_date: string;
    items: InvoiceItem[];
    notes: string;
    pdf_url: string;
  }>,
): Promise<Invoice> {
  const properties: any = {};
  if (data.status) {
    const map: Record<string, string> = { draft: '下書き', sent: '送付済', paid: '入金済' };
    properties['ステータス'] = { select: { name: map[data.status] } };
  }
  if (data.recipient_name !== undefined) {
    properties['宛名'] = { rich_text: [{ text: { content: data.recipient_name } }] };
  }
  if (data.issued_date) {
    properties['発行日'] = { date: { start: data.issued_date } };
  }
  if (data.items) {
    const total = data.items.reduce((sum, item) => sum + item.amount, 0);
    properties['品目JSON'] = { rich_text: [{ text: { content: JSON.stringify(data.items) } }] };
    properties['合計金額'] = { number: total };
  }
  if (data.notes !== undefined) {
    properties['備考'] = { rich_text: [{ text: { content: data.notes } }] };
  }
  if (data.pdf_url) {
    properties['PDF URL'] = { url: data.pdf_url };
  }

  const page: any = await notionFetch(env, `/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
  return pageToInvoice(page);
}

export async function deleteInvoice(env: NotionEnv, id: string): Promise<void> {
  await notionFetch(env, `/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

export async function duplicateInvoice(
  env: NotionEnv,
  id: string,
  newType: 'estimate' | 'invoice',
): Promise<Invoice> {
  const original = await getInvoice(env, id);
  return createInvoice(env, {
    type: newType,
    recipient_name: original.recipient_name,
    friend_id: original.friend_id || undefined,
    issued_date: new Date().toISOString().slice(0, 10),
    items: original.items,
    notes: original.notes,
    chat_summary: original.chat_summary || undefined,
  });
}
