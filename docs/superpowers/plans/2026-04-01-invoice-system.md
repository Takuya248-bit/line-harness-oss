# 見積書・請求書システム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 名前を入力するだけでLINEチャット履歴からAIが請求内容を自動抽出し、Misoca準拠のPDFを生成するシステムを構築する

**Architecture:** Cloudflare Worker (Hono) 単体で動作。LINE HarnessのD1を読み取り専用で参照し、データ蓄積はNotion DB、PDF保存はR2。管理UIはWorkerが配信する単一HTML (Tailwind CDN + vanilla JS)。

**Tech Stack:** Cloudflare Workers, Hono, jsPDF, Notion API, Claude API, R2, D1 (読み取り専用)

---

## Task 1: プロジェクト初期化 + Workerスケルトン

**Files:**
- Create: `apps/invoice/src/index.ts`
- Create: `apps/invoice/wrangler.toml`
- Create: `apps/invoice/package.json`
- Create: `apps/invoice/tsconfig.json`

- [ ] **Step 1: ディレクトリ作成とpackage.json**

```bash
mkdir -p apps/invoice/src
```

`apps/invoice/package.json`:
```json
{
  "name": "invoice-worker",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250224.0",
    "typescript": "^5.7.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: wrangler.toml**

`apps/invoice/wrangler.toml`:
```toml
name = "invoice-worker"
main = "src/index.ts"
compatibility_date = "2024-12-01"
workers_dev = true
account_id = "229bf2a0291a81cfe581a1f9bbb24432"

# LINE HarnessのD1を読み取り専用で参照
[[d1_databases]]
binding = "DB"
database_name = "line-crm"
database_id = "e626281f-33ee-4128-a583-6bd367ba8340"

# PDF保存用R2バケット（要作成: wrangler r2 bucket create invoice-pdf）
[[r2_buckets]]
binding = "INVOICE_BUCKET"
bucket_name = "invoice-pdf"

# Secrets (wrangler secret put で設定):
# NOTION_API_KEY, NOTION_DB_ID, ANTHROPIC_API_KEY, API_KEY
```

- [ ] **Step 3: tsconfig.json**

`apps/invoice/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Honoスケルトン**

`apps/invoice/src/index.ts`:
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

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

// 簡易認証
app.use('/api/*', async (c, next) => {
  const key = c.req.header('X-API-Key') || new URL(c.req.url).searchParams.get('key');
  if (key !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));

export default app;
```

- [ ] **Step 5: 型チェック + 動作確認**

```bash
cd apps/invoice && pnpm install && pnpm typecheck
```

Expected: エラー0

- [ ] **Step 6: コミット**

```bash
git add apps/invoice/
git commit -m "feat(invoice): init worker skeleton with Hono + D1/R2/Notion bindings"
```

---

## Task 2: Notion DBセットアップ + CRUD API

**Files:**
- Create: `apps/invoice/src/services/notion.ts`
- Create: `apps/invoice/src/routes/invoices.ts`
- Modify: `apps/invoice/src/index.ts`

- [ ] **Step 1: Notion API操作サービス**

`apps/invoice/src/services/notion.ts`:
```typescript
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
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
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

function pageToInvoice(page: any): Invoice {
  const props = page.properties;
  return {
    id: page.id,
    type: props['種別']?.select?.name === '見積書' ? 'estimate' : 'invoice',
    status: props['ステータス']?.select?.name === '入金済' ? 'paid'
      : props['ステータス']?.select?.name === '送付済' ? 'sent' : 'draft',
    invoice_number: props['タイトル']?.title?.[0]?.plain_text || '',
    recipient_name: props['宛名']?.rich_text?.[0]?.plain_text || '',
    friend_id: props['friend_id']?.rich_text?.[0]?.plain_text || null,
    issued_date: props['発行日']?.date?.start || '',
    total: props['合計金額']?.number || 0,
    items: JSON.parse(props['品目JSON']?.rich_text?.[0]?.plain_text || '[]'),
    notes: props['備考']?.rich_text?.[0]?.plain_text || '',
    pdf_url: props['PDF URL']?.url || null,
    chat_summary: props['元チャット要約']?.rich_text?.[0]?.plain_text || null,
    created_at: page.created_time,
  };
}

export async function generateInvoiceNumber(env: NotionEnv): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // 当日の件数をカウントして採番
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
    filters.push({ property: '種別', select: { equals: type === 'estimate' ? '見積書' : '請求書' } });
  }
  if (status) {
    const map: Record<string, string> = { draft: '下書き', sent: '送付済', paid: '入金済' };
    filters.push({ property: 'ステータス', select: { equals: map[status] || status } });
  }

  const body: any = {
    sorts: [{ property: '作成日時', direction: 'descending' }],
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
        'タイトル': { title: [{ text: { content: number } }] },
        '種別': { select: { name: typeLabel } },
        'ステータス': { select: { name: '下書き' } },
        '宛名': { rich_text: [{ text: { content: data.recipient_name } }] },
        'friend_id': { rich_text: [{ text: { content: data.friend_id || '' } }] },
        '発行日': { date: { start: data.issued_date } },
        '合計金額': { number: total },
        '品目JSON': { rich_text: [{ text: { content: JSON.stringify(data.items) } }] },
        '備考': { rich_text: [{ text: { content: data.notes } }] },
        '元チャット要約': { rich_text: [{ text: { content: data.chat_summary || '' } }] },
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
  if (data.recipient_name) {
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

export async function duplicateInvoice(env: NotionEnv, id: string, newType: 'estimate' | 'invoice'): Promise<Invoice> {
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
```

- [ ] **Step 2: ルート定義**

`apps/invoice/src/routes/invoices.ts`:
```typescript
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
  const env = c.env;
  const data = await listInvoices(env, type, status);
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
```

- [ ] **Step 3: index.tsにルートをマウント**

`apps/invoice/src/index.ts` の `app.get('/health'...)` の前に追加:
```typescript
import { invoices } from './routes/invoices.js';

// 既存のapp定義の後に追加
app.route('', invoices);
```

- [ ] **Step 4: 型チェック**

```bash
cd apps/invoice && pnpm typecheck
```

Expected: エラー0

- [ ] **Step 5: コミット**

```bash
git add apps/invoice/
git commit -m "feat(invoice): add Notion CRUD API for invoices"
```

---

## Task 3: チャット履歴読み取り + AI抽出

**Files:**
- Create: `apps/invoice/src/services/chat-reader.ts`
- Create: `apps/invoice/src/services/ai-extractor.ts`
- Create: `apps/invoice/src/routes/extract.ts`
- Modify: `apps/invoice/src/index.ts`

- [ ] **Step 1: D1チャット読み取りサービス**

`apps/invoice/src/services/chat-reader.ts`:
```typescript
export interface ChatMessage {
  direction: 'incoming' | 'outgoing';
  content: string;
  created_at: string;
}

export interface FriendInfo {
  id: string;
  display_name: string;
}

export async function searchFriend(db: D1Database, name: string): Promise<FriendInfo[]> {
  const result = await db
    .prepare('SELECT id, display_name FROM friends WHERE display_name LIKE ? LIMIT 10')
    .bind(`%${name}%`)
    .all<FriendInfo>();
  return result.results;
}

export async function getChatHistory(
  db: D1Database,
  friendId: string,
  days: number = 30,
  limit: number = 50,
): Promise<ChatMessage[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const result = await db
    .prepare(
      `SELECT direction, content, created_at FROM messages_log
       WHERE friend_id = ? AND message_type = 'text' AND created_at > ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .bind(friendId, sinceStr, limit)
    .all<ChatMessage>();
  return result.results.reverse();
}
```

- [ ] **Step 2: AI抽出サービス**

`apps/invoice/src/services/ai-extractor.ts`:
```typescript
import type { InvoiceItem } from './notion.js';
import type { ChatMessage } from './chat-reader.js';

export interface ExtractResult {
  items: InvoiceItem[];
  notes: string;
  summary: string;
}

const DEFAULT_NOTES = `【料金に含まれているもの】
・授業料
・3食の食事
※外泊プランの場合お食事は含まれません。
・宿舎
・空港送迎
・卒業後コミュニティ
・学習面談
・カリキュラム作成
・ツアー・イベント紹介

※以下は料金に含まれておりません。
・航空券
・VISA
・現地での生活費
・海外保険料`;

export async function extractFromChat(
  apiKey: string,
  messages: ChatMessage[],
  recipientName: string,
): Promise<ExtractResult> {
  const chatText = messages
    .map((m) => `${m.direction === 'incoming' ? recipientName : 'スタッフ'}: ${m.content}`)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `以下のLINEチャット履歴から、請求書に必要な情報を抽出してJSON形式で返してください。

抽出ルール:
- コース名は正式名称（期間含む）で記載
- 割引がある場合は別行でマイナス金額として記載（例: 入学金 30,000 と 入学金無料 -30,000）
- 金額が明示されていない場合は「不明」と記載
- summaryは会話の要約（何のコースをどういう条件で契約したか）を50文字以内で

チャット履歴:
${chatText}

以下のJSON形式のみで返してください（説明不要）:
{"items":[{"name":"品目名","quantity":1,"unit_price":金額,"amount":金額}],"notes":"","summary":"要約"}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status}`);
  }

  const body: any = await res.json();
  const text = body.content[0].text;

  // JSONブロックを抽出（```json...```やそのまま{}の両方に対応）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI応答からJSONを抽出できませんでした');
  }

  const parsed = JSON.parse(jsonMatch[0]) as ExtractResult;

  // notesが空ならデフォルトテンプレを使用
  if (!parsed.notes || parsed.notes.trim() === '') {
    parsed.notes = DEFAULT_NOTES;
  }

  return parsed;
}

export { DEFAULT_NOTES };
```

- [ ] **Step 3: 抽出APIルート**

`apps/invoice/src/routes/extract.ts`:
```typescript
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { searchFriend, getChatHistory } from '../services/chat-reader.js';
import { extractFromChat, DEFAULT_NOTES } from '../services/ai-extractor.js';

export const extract = new Hono<Env>();

extract.post('/api/extract', async (c) => {
  const { query, type } = await c.req.json<{ query: string; type: 'estimate' | 'invoice' }>();
  const db = c.env.DB;

  // 1. 名前でfriend検索
  const friends = await searchFriend(db, query);

  if (friends.length === 0) {
    // friend見つからない → 手入力モード
    return c.json({
      success: true,
      mode: 'manual',
      data: {
        recipient_name: query,
        items: [],
        notes: DEFAULT_NOTES,
        summary: null,
      },
    });
  }

  if (friends.length > 1) {
    // 複数候補 → 選択を促す
    return c.json({
      success: true,
      mode: 'select',
      candidates: friends.map((f) => ({ id: f.id, name: f.display_name })),
    });
  }

  // 2. チャット履歴取得
  const friend = friends[0];
  const messages = await getChatHistory(db, friend.id);

  if (messages.length === 0) {
    return c.json({
      success: true,
      mode: 'manual',
      data: {
        recipient_name: friend.display_name,
        friend_id: friend.id,
        items: [],
        notes: DEFAULT_NOTES,
        summary: null,
      },
    });
  }

  // 3. AI抽出
  const extracted = await extractFromChat(c.env.ANTHROPIC_API_KEY, messages, friend.display_name);

  return c.json({
    success: true,
    mode: 'prefilled',
    data: {
      recipient_name: friend.display_name,
      friend_id: friend.id,
      items: extracted.items,
      notes: extracted.notes,
      summary: extracted.summary,
    },
  });
});
```

- [ ] **Step 4: index.tsにマウント**

`apps/invoice/src/index.ts` に追加:
```typescript
import { extract } from './routes/extract.js';

app.route('', extract);
```

- [ ] **Step 5: 型チェック**

```bash
cd apps/invoice && pnpm typecheck
```

Expected: エラー0

- [ ] **Step 6: コミット**

```bash
git add apps/invoice/
git commit -m "feat(invoice): add chat history reader + AI extraction from messages_log"
```

---

## Task 4: PDF生成 (jsPDF + 日本語フォント)

**Files:**
- Create: `apps/invoice/src/services/pdf-generator.ts`
- Create: `apps/invoice/src/templates/layout.ts`
- Create: `apps/invoice/src/routes/pdf.ts`
- Modify: `apps/invoice/src/index.ts`
- Modify: `apps/invoice/package.json`

- [ ] **Step 1: 依存追加**

```bash
cd apps/invoice && pnpm add jspdf
```

- [ ] **Step 2: 固定テンプレート**

`apps/invoice/src/templates/layout.ts`:
```typescript
export const COMPANY = {
  name_en: 'PT. Perjalanan Penuh Kenagan',
  name_ja: 'バリリンガル',
  representative: '代表 木村拓也',
  address_1: 'Perum Jadi Pesona, J',
  address_2: 'Pulau Moyo Blok VII',
  email: 'info@balilingual.com',
};

export const BANK = {
  label: 'お振込先：',
  detail: '金融機関名：住信SBIネット銀行 支店コード：101 普通預金：8704889 口座名義：キムラタクヤ',
};

export const GREETING_INVOICE = '下記のとおりご請求申し上げます。';
export const GREETING_ESTIMATE = '下記のとおりお見積り申し上げます。';
```

- [ ] **Step 3: PDF生成サービス**

`apps/invoice/src/services/pdf-generator.ts`:
```typescript
import { jsPDF } from 'jspdf';
import type { Invoice } from './notion.js';
import { COMPANY, BANK, GREETING_INVOICE, GREETING_ESTIMATE } from '../templates/layout.js';

// NotoSansJP フォントはbase64でバンドル（Task 4 Step 4で生成）
// @ts-expect-error -- font file import
import { notoSansJPRegular, notoSansJPBold } from './fonts.js';

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

export function generateInvoicePDF(invoice: Invoice): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isEstimate = invoice.type === 'estimate';
  const title = isEstimate ? '見積書' : '請求書';
  const greeting = isEstimate ? GREETING_ESTIMATE : GREETING_INVOICE;
  const amountLabel = isEstimate ? 'お見積金額' : 'ご請求金額';

  // フォント登録
  doc.addFileToVFS('NotoSansJP-Regular.ttf', notoSansJPRegular);
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
  doc.addFileToVFS('NotoSansJP-Bold.ttf', notoSansJPBold);
  doc.addFont('NotoSansJP-Bold.ttf', 'NotoSansJP', 'bold');
  doc.setFont('NotoSansJP', 'normal');

  const pageWidth = 210;
  const margin = 20;
  let y = 20;

  // === 右上: 日付・番号 ===
  doc.setFontSize(10);
  doc.text(invoice.issued_date.replace(/-/g, '年').replace(/年(\d{2})$/, '月$1日'), pageWidth - margin, y, { align: 'right' });
  y += 6;
  doc.text(`${isEstimate ? '見積' : '請求'}番号: ${invoice.invoice_number}`, pageWidth - margin, y, { align: 'right' });
  y += 12;

  // === タイトル ===
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(24);
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 16;

  // === 左: 宛名 ===
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(14);
  doc.text(`${invoice.recipient_name} 様`, margin, y);
  y += 8;
  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(10);
  doc.text(greeting, margin, y);
  y += 8;
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(14);
  doc.text(`${amountLabel}`, margin, y);
  doc.text(`${formatYen(invoice.total)}-`, margin + 50, y);

  // === 右: 会社情報 ===
  const companyX = 120;
  let companyY = y - 16;
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(10);
  doc.text(COMPANY.name_en, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.name_ja, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.representative, companyX, companyY);
  companyY += 6;
  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(9);
  doc.text(COMPANY.address_1, companyX, companyY);
  companyY += 4;
  doc.text(COMPANY.address_2, companyX, companyY);
  companyY += 5;
  doc.text(COMPANY.email, companyX, companyY);

  y += 16;

  // === テーブル ===
  const tableX = margin;
  const colWidths = { name: 85, qty: 20, price: 30, amount: 35 };
  const tableWidth = colWidths.name + colWidths.qty + colWidths.price + colWidths.amount;
  const rowHeight = 8;

  // ヘッダー
  doc.setFillColor(50, 50, 50);
  doc.rect(tableX, y, tableWidth, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('NotoSansJP', 'bold');
  doc.text('品番・品名', tableX + 2, y + 5.5);
  doc.text('数量', tableX + colWidths.name + colWidths.qty / 2, y + 5.5, { align: 'center' });
  doc.text('単価', tableX + colWidths.name + colWidths.qty + colWidths.price / 2, y + 5.5, { align: 'center' });
  doc.text('金額', tableX + colWidths.name + colWidths.qty + colWidths.price + colWidths.amount / 2, y + 5.5, { align: 'center' });
  y += rowHeight;

  doc.setTextColor(0, 0, 0);
  doc.setFont('NotoSansJP', 'normal');

  // 品目行（最大10行表示）
  const maxRows = 10;
  for (let i = 0; i < maxRows; i++) {
    const item = invoice.items[i];
    // 罫線
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableX, y, colWidths.name, rowHeight);
    doc.rect(tableX + colWidths.name, y, colWidths.qty, rowHeight);
    doc.rect(tableX + colWidths.name + colWidths.qty, y, colWidths.price, rowHeight);
    doc.rect(tableX + colWidths.name + colWidths.qty + colWidths.price, y, colWidths.amount, rowHeight);

    if (item) {
      doc.text(item.name, tableX + 2, y + 5.5);
      doc.text(String(item.quantity), tableX + colWidths.name + colWidths.qty / 2, y + 5.5, { align: 'center' });
      doc.text(item.unit_price.toLocaleString('ja-JP'), tableX + colWidths.name + colWidths.qty + colWidths.price - 2, y + 5.5, { align: 'right' });
      doc.text(item.amount.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, { align: 'right' });
    }
    y += rowHeight;
  }

  // 小計・合計
  const subtotal = invoice.items.reduce((sum, item) => sum + item.amount, 0);
  const totalX = tableX + colWidths.name;
  const totalWidth = colWidths.qty + colWidths.price + colWidths.amount;
  doc.setFont('NotoSansJP', 'bold');
  doc.rect(totalX, y, totalWidth, rowHeight);
  doc.text('小計', totalX + 2, y + 5.5);
  doc.text(subtotal.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, { align: 'right' });
  y += rowHeight;
  doc.rect(totalX, y, totalWidth, rowHeight);
  doc.text('合計', totalX + 2, y + 5.5);
  doc.text(invoice.total.toLocaleString('ja-JP'), tableX + tableWidth - 2, y + 5.5, { align: 'right' });
  y += rowHeight + 8;

  // === 備考 ===
  doc.setFont('NotoSansJP', 'normal');
  doc.setFontSize(9);
  const noteLines = invoice.notes.split('\n');
  for (const line of noteLines) {
    doc.text(line, margin, y);
    y += 4.5;
  }

  // === フッター: 振込先 ===
  const footerY = 275;
  doc.setDrawColor(100, 100, 100);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  doc.setFont('NotoSansJP', 'bold');
  doc.setFontSize(9);
  doc.text(BANK.label, margin, footerY);
  doc.setFont('NotoSansJP', 'normal');
  doc.text(BANK.detail, margin, footerY + 5);

  return doc.output('arraybuffer');
}
```

- [ ] **Step 4: 日本語フォントファイル準備**

NotoSansJP-Regular.ttf と NotoSansJP-Bold.ttf をbase64に変換してバンドルする。
フォントサイズを抑えるため、サブセット化（ひらがな・カタカナ・漢字常用2136字+記号+英数）を行う。

```bash
# pyftsubsetでサブセット化（要: pip install fonttools brotli）
# Google Fontsからダウンロード後:
cd apps/invoice/src/services

# サブセット作成（約500KB程度に圧縮）
pyftsubset NotoSansJP-Regular.ttf \
  --text-file=<(echo "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,.-/:;()¥￥様御中請求書見積金額品番名数量単価小計合計下記申上げます日常英会話コース週間特別料金入学無円年月発行番号代表振込先融機関住信SBI支店普通預金口座義含食事外泊宿舎空港送迎卒業後学習面談作成紹介航券現地生活費海保険備考プランカリキュラムツアーイベントバリリンガルネット銀行コミュニティ") \
  --output-file=NotoSansJP-Regular-subset.ttf

# base64変換
node -e "
const fs = require('fs');
const reg = fs.readFileSync('NotoSansJP-Regular-subset.ttf').toString('base64');
const bold = fs.readFileSync('NotoSansJP-Bold-subset.ttf').toString('base64');
fs.writeFileSync('fonts.ts',
  'export const notoSansJPRegular = \"' + reg + '\";\n' +
  'export const notoSansJPBold = \"' + bold + '\";\n'
);
"
```

注意: サブセットの文字セットは実際の請求書で使う文字をカバーする必要がある。不足があれば文字を追加してサブセットを再生成する。フルフォントは4MB超になるため必ずサブセット化する。

- [ ] **Step 5: PDFルート**

`apps/invoice/src/routes/pdf.ts`:
```typescript
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { getInvoice, updateInvoice } from '../services/notion.js';
import { generateInvoicePDF } from '../services/pdf-generator.js';

export const pdf = new Hono<Env>();

pdf.get('/api/invoices/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const invoice = await getInvoice(c.env, id);

  // R2にキャッシュがあればそれを返す
  const r2Key = `invoices/${invoice.invoice_number}.pdf`;
  const cached = await c.env.INVOICE_BUCKET.get(r2Key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  }

  // PDF生成
  const pdfBuffer = generateInvoicePDF(invoice);

  // R2に保存
  await c.env.INVOICE_BUCKET.put(r2Key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  // NotionにPDF URLを記録
  const pdfUrl = `${new URL(c.req.url).origin}/api/invoices/${id}/pdf?key=${c.env.API_KEY}`;
  await updateInvoice(c.env, id, { pdf_url: pdfUrl });

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
});

// PDF再生成（更新後に呼ぶ）
pdf.post('/api/invoices/:id/pdf/regenerate', async (c) => {
  const id = c.req.param('id');
  const invoice = await getInvoice(c.env, id);
  const r2Key = `invoices/${invoice.invoice_number}.pdf`;

  // 古いキャッシュ削除
  await c.env.INVOICE_BUCKET.delete(r2Key);

  // 再生成
  const pdfBuffer = generateInvoicePDF(invoice);
  await c.env.INVOICE_BUCKET.put(r2Key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  return c.json({ success: true, message: 'PDF regenerated' });
});
```

- [ ] **Step 6: index.tsにマウント**

`apps/invoice/src/index.ts` に追加:
```typescript
import { pdf } from './routes/pdf.js';

app.route('', pdf);
```

- [ ] **Step 7: 型チェック**

```bash
cd apps/invoice && pnpm typecheck
```

Expected: エラー0（fonts.tsが未生成の場合はStep 4を先に実行）

- [ ] **Step 8: コミット**

```bash
git add apps/invoice/
git commit -m "feat(invoice): add jsPDF generator with Misoca-compatible layout"
```

---

## Task 5: 管理UI (単一HTML SPA)

**Files:**
- Create: `apps/invoice/src/ui/index.html`
- Modify: `apps/invoice/src/index.ts`

- [ ] **Step 1: HTML SPA**

`apps/invoice/src/ui/index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>請求書管理</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    [x-cloak] { display: none !important; }
    .loader { border: 3px solid #f3f3f3; border-top: 3px solid #f97316; border-radius: 50%; width: 24px; height: 24px; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <div id="app" class="max-w-4xl mx-auto px-4 py-8">

    <!-- ヘッダー -->
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-bold text-gray-800">請求書管理</h1>
      <button onclick="showList()" class="text-sm text-gray-500 hover:text-gray-700">一覧に戻る</button>
    </div>

    <!-- メイン入力 -->
    <div id="view-main" class="space-y-4">
      <div class="bg-white rounded-lg shadow p-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">名前を入力するだけ</label>
        <div class="flex gap-2">
          <input id="input-query" type="text" placeholder="例: 星慎一郎" class="flex-1 rounded-lg border-gray-300 border px-4 py-3 text-lg focus:ring-2 focus:ring-orange-400 focus:border-orange-400">
          <button onclick="doExtract('invoice')" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium">請求書</button>
          <button onclick="doExtract('estimate')" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium">見積書</button>
        </div>
        <p class="text-xs text-gray-400 mt-2">LINEのチャット履歴からAIが自動で品目・金額を抽出します</p>
      </div>

      <!-- ローディング -->
      <div id="loading" class="hidden flex items-center justify-center py-8">
        <div class="loader mr-3"></div>
        <span class="text-gray-500">チャット履歴を解析中...</span>
      </div>

      <!-- 候補選択 -->
      <div id="candidates" class="hidden bg-white rounded-lg shadow p-6">
        <p class="text-sm font-medium text-gray-700 mb-3">複数の候補が見つかりました:</p>
        <div id="candidate-list" class="space-y-2"></div>
      </div>
    </div>

    <!-- 編集フォーム -->
    <div id="view-edit" class="hidden space-y-4">
      <div class="bg-white rounded-lg shadow p-6 space-y-4">
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">種別</label>
            <span id="edit-type-badge" class="inline-block px-3 py-1 rounded-full text-sm font-medium"></span>
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">宛名</label>
            <input id="edit-name" type="text" class="w-full rounded border-gray-300 border px-3 py-2">
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">発行日</label>
            <input id="edit-date" type="date" class="w-full rounded border-gray-300 border px-3 py-2">
          </div>
        </div>

        <!-- AI要約 -->
        <div id="edit-summary-box" class="hidden bg-blue-50 rounded p-3">
          <p class="text-xs text-blue-600 font-medium">AI抽出結果:</p>
          <p id="edit-summary" class="text-sm text-blue-800"></p>
        </div>

        <!-- 品目テーブル -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">品目</label>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b">
                <th class="text-left py-2 w-1/2">品名</th>
                <th class="text-center py-2 w-16">数量</th>
                <th class="text-right py-2 w-28">単価</th>
                <th class="text-right py-2 w-28">金額</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody id="items-body"></tbody>
          </table>
          <button onclick="addItem()" class="mt-2 text-sm text-orange-500 hover:text-orange-700">+ 品目を追加</button>
        </div>

        <!-- 合計 -->
        <div class="flex justify-end">
          <div class="text-right">
            <span class="text-gray-600">合計: </span>
            <span id="edit-total" class="text-2xl font-bold text-gray-900">¥0</span>
          </div>
        </div>

        <!-- 備考 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">備考</label>
          <textarea id="edit-notes" rows="10" class="w-full rounded border-gray-300 border px-3 py-2 text-sm"></textarea>
        </div>

        <div class="flex gap-2">
          <button onclick="saveInvoice()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium">保存してPDF生成</button>
          <button onclick="showMain()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium">キャンセル</button>
        </div>
      </div>
    </div>

    <!-- 一覧 -->
    <div id="view-list" class="hidden space-y-4">
      <div class="flex gap-2 mb-4">
        <button onclick="loadList('all')" class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200" data-tab="all">すべて</button>
        <button onclick="loadList('invoice')" class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100" data-tab="invoice">請求書</button>
        <button onclick="loadList('estimate')" class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100" data-tab="estimate">見積書</button>
      </div>
      <div id="invoice-list" class="space-y-2"></div>
    </div>

    <!-- 完了画面 -->
    <div id="view-done" class="hidden">
      <div class="bg-white rounded-lg shadow p-8 text-center">
        <div class="text-5xl mb-4">✅</div>
        <p class="text-lg font-medium text-gray-800 mb-2">保存完了</p>
        <p id="done-number" class="text-gray-500 mb-4"></p>
        <div class="flex gap-3 justify-center">
          <a id="done-pdf-link" href="#" target="_blank" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium">PDFを開く</a>
          <button onclick="copyPdfLink()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium">リンクをコピー</button>
          <button onclick="showMain()" class="bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-3 rounded-lg font-medium">新規作成</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_KEY = new URLSearchParams(location.search).get('key') || '';
    const BASE = '';
    let currentType = 'invoice';
    let currentFriendId = null;
    let currentSummary = null;

    function headers() {
      return { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };
    }

    async function api(method, path, body) {
      const opts = { method, headers: headers() };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(BASE + path, opts);
      return res.json();
    }

    // === Views ===
    function hideAll() {
      ['view-main', 'view-edit', 'view-list', 'view-done', 'loading', 'candidates'].forEach(
        id => document.getElementById(id).classList.add('hidden')
      );
    }
    function showMain() { hideAll(); document.getElementById('view-main').classList.remove('hidden'); }
    function showEdit() { hideAll(); document.getElementById('view-edit').classList.remove('hidden'); }
    function showDone() { hideAll(); document.getElementById('view-done').classList.remove('hidden'); }
    function showList() { hideAll(); document.getElementById('view-list').classList.remove('hidden'); loadList('all'); }

    // === Extract ===
    async function doExtract(type) {
      const query = document.getElementById('input-query').value.trim();
      if (!query) return;
      currentType = type;

      document.getElementById('loading').classList.remove('hidden');
      document.getElementById('candidates').classList.add('hidden');

      try {
        const res = await api('POST', '/api/extract', { query, type });
        document.getElementById('loading').classList.add('hidden');

        if (res.data && res.mode === 'select') {
          // 候補選択
          const list = document.getElementById('candidate-list');
          list.innerHTML = res.candidates.map(c =>
            `<button onclick="selectCandidate('${c.id}', '${c.name}')" class="block w-full text-left px-4 py-3 rounded hover:bg-orange-50 border">${c.name}</button>`
          ).join('');
          document.getElementById('candidates').classList.remove('hidden');
          return;
        }

        currentFriendId = res.data?.friend_id || null;
        currentSummary = res.data?.summary || null;
        populateForm(type, res.data);
        showEdit();
      } catch (e) {
        document.getElementById('loading').classList.add('hidden');
        alert('エラー: ' + e.message);
      }
    }

    async function selectCandidate(friendId, name) {
      document.getElementById('input-query').value = name;
      document.getElementById('candidates').classList.add('hidden');
      document.getElementById('loading').classList.remove('hidden');

      const res = await api('POST', '/api/extract', { query: name, type: currentType });
      document.getElementById('loading').classList.add('hidden');
      currentFriendId = res.data?.friend_id || friendId;
      currentSummary = res.data?.summary || null;
      populateForm(currentType, res.data);
      showEdit();
    }

    // === Edit Form ===
    function populateForm(type, data) {
      const badge = document.getElementById('edit-type-badge');
      badge.textContent = type === 'invoice' ? '請求書' : '見積書';
      badge.className = `inline-block px-3 py-1 rounded-full text-sm font-medium ${type === 'invoice' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`;

      document.getElementById('edit-name').value = data.recipient_name || '';
      document.getElementById('edit-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('edit-notes').value = data.notes || '';

      if (data.summary) {
        document.getElementById('edit-summary').textContent = data.summary;
        document.getElementById('edit-summary-box').classList.remove('hidden');
      } else {
        document.getElementById('edit-summary-box').classList.add('hidden');
      }

      const tbody = document.getElementById('items-body');
      tbody.innerHTML = '';
      if (data.items && data.items.length > 0) {
        data.items.forEach(item => addItem(item));
      } else {
        addItem();
      }
      calcTotal();
    }

    function addItem(item) {
      const tbody = document.getElementById('items-body');
      const tr = document.createElement('tr');
      tr.className = 'border-b';
      tr.innerHTML = `
        <td class="py-1"><input type="text" value="${item?.name || ''}" class="w-full border rounded px-2 py-1 item-name" oninput="calcTotal()"></td>
        <td class="py-1"><input type="number" value="${item?.quantity || 1}" class="w-full border rounded px-2 py-1 text-center item-qty" oninput="calcTotal()"></td>
        <td class="py-1"><input type="number" value="${item?.unit_price || ''}" class="w-full border rounded px-2 py-1 text-right item-price" oninput="calcTotal()"></td>
        <td class="py-1 text-right item-amount font-medium">${item?.amount?.toLocaleString('ja-JP') || '0'}</td>
        <td class="py-1"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 px-2">✕</button></td>
      `;
      tbody.appendChild(tr);
    }

    function calcTotal() {
      let total = 0;
      document.querySelectorAll('#items-body tr').forEach(tr => {
        const qty = parseInt(tr.querySelector('.item-qty').value) || 0;
        const price = parseInt(tr.querySelector('.item-price').value) || 0;
        const amount = qty * price;
        tr.querySelector('.item-amount').textContent = amount.toLocaleString('ja-JP');
        total += amount;
      });
      document.getElementById('edit-total').textContent = `¥${total.toLocaleString('ja-JP')}`;
    }

    function getFormData() {
      const items = [];
      document.querySelectorAll('#items-body tr').forEach(tr => {
        const name = tr.querySelector('.item-name').value;
        const quantity = parseInt(tr.querySelector('.item-qty').value) || 0;
        const unit_price = parseInt(tr.querySelector('.item-price').value) || 0;
        if (name) items.push({ name, quantity, unit_price, amount: quantity * unit_price });
      });
      return {
        type: currentType,
        recipient_name: document.getElementById('edit-name').value,
        friend_id: currentFriendId,
        issued_date: document.getElementById('edit-date').value,
        items,
        notes: document.getElementById('edit-notes').value,
        chat_summary: currentSummary,
      };
    }

    // === Save ===
    async function saveInvoice() {
      const data = getFormData();
      if (!data.recipient_name || data.items.length === 0) {
        alert('宛名と品目を入力してください');
        return;
      }

      try {
        const res = await api('POST', '/api/invoices', data);
        if (!res.success) throw new Error(res.error || 'Save failed');

        // PDF生成
        const pdfUrl = `${BASE}/api/invoices/${res.data.id}/pdf?key=${API_KEY}`;
        await fetch(pdfUrl);

        document.getElementById('done-number').textContent = res.data.invoice_number;
        document.getElementById('done-pdf-link').href = pdfUrl;
        showDone();
      } catch (e) {
        alert('保存エラー: ' + e.message);
      }
    }

    function copyPdfLink() {
      const url = document.getElementById('done-pdf-link').href;
      navigator.clipboard.writeText(url);
      alert('コピーしました');
    }

    // === List ===
    async function loadList(filter) {
      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.className = `px-4 py-2 rounded-lg text-sm font-medium ${btn.dataset.tab === filter ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`;
      });

      const params = filter === 'all' ? '' : `?type=${filter}`;
      const res = await api('GET', '/api/invoices' + params);
      const list = document.getElementById('invoice-list');

      if (!res.data || res.data.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-8">まだデータがありません</p>';
        return;
      }

      const statusColors = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
      const statusLabels = { draft: '下書き', sent: '送付済', paid: '入金済' };
      const typeLabels = { estimate: '見積書', invoice: '請求書' };

      list.innerHTML = res.data.map(inv => `
        <div class="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <span class="text-xs px-2 py-0.5 rounded-full ${inv.type === 'estimate' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}">${typeLabels[inv.type]}</span>
            <span class="text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status]}">${statusLabels[inv.status]}</span>
            <span class="ml-2 font-medium">${inv.recipient_name}</span>
            <span class="ml-2 text-gray-400 text-sm">${inv.invoice_number}</span>
          </div>
          <div class="flex items-center gap-4">
            <span class="font-bold">¥${inv.total.toLocaleString('ja-JP')}</span>
            ${inv.pdf_url ? `<a href="${inv.pdf_url}" target="_blank" class="text-orange-500 hover:text-orange-700 text-sm">PDF</a>` : ''}
            <button onclick="duplicateInvoice('${inv.id}')" class="text-gray-400 hover:text-gray-600 text-sm">複製</button>
          </div>
        </div>
      `).join('');
    }

    async function duplicateInvoice(id) {
      const type = prompt('種別を選択: invoice or estimate', 'invoice');
      if (!type) return;
      await api('POST', `/api/invoices/${id}/duplicate`, { type });
      loadList('all');
    }

    // 初期表示
    showMain();
  </script>
</body>
</html>
```

- [ ] **Step 2: UIをWorkerから配信**

`apps/invoice/src/index.ts` に追加（authミドルウェアの前に配置）:
```typescript
// UI配信（認証不要、API_KEYはクエリパラメータで渡す）
app.get('/', (c) => {
  return c.html(UI_HTML);
});
```

UIのHTMLはビルド時にインライン化する。`src/index.ts` の先頭付近で:
```typescript
// HTML は wrangler がバンドルしてくれるので、テキストとしてインポート
const UI_HTML = `<!-- index.htmlの内容をここに文字列として埋め込む -->`;
```

実際の実装方法: wranglerのtext moduleを使う。`wrangler.toml` に追加:
```toml
[rules]
type = "Text"
globs = ["**/*.html"]
fallthrough = true
```

`src/index.ts`:
```typescript
import uiHtml from './ui/index.html';

// authミドルウェアの前に配置
app.get('/', (c) => {
  return c.html(uiHtml);
});
```

- [ ] **Step 3: 型チェック**

```bash
cd apps/invoice && pnpm typecheck
```

HTMLインポートでエラーが出る場合、`src/html.d.ts` を作成:
```typescript
declare module '*.html' {
  const content: string;
  export default content;
}
```

- [ ] **Step 4: コミット**

```bash
git add apps/invoice/
git commit -m "feat(invoice): add single-page management UI with AI extraction flow"
```

---

## Task 6: R2バケット作成 + Notion DB作成 + デプロイ

**Files:**
- No new code files (infrastructure setup)

- [ ] **Step 1: R2バケット作成**

```bash
cd apps/invoice && npx wrangler r2 bucket create invoice-pdf
```

Expected: `Created bucket invoice-pdf`

- [ ] **Step 2: Notion DBをAPIで作成**

Notion Integration作成 → DBを手動 or API で作成。以下のプロパティを設定:

| プロパティ名 | 型 |
|-------------|-----|
| タイトル | Title |
| 種別 | Select (見積書 / 請求書) |
| ステータス | Select (下書き / 送付済 / 入金済) |
| 宛名 | Rich Text |
| friend_id | Rich Text |
| 発行日 | Date |
| 合計金額 | Number |
| 品目JSON | Rich Text |
| 備考 | Rich Text |
| PDF URL | URL |
| 元チャット要約 | Rich Text |

Integration を DB に接続（Share → Invite → Integration名で検索）。

- [ ] **Step 3: Secrets設定**

```bash
cd apps/invoice
echo "NOTION_API_KEYを設定"
npx wrangler secret put NOTION_API_KEY
npx wrangler secret put NOTION_DB_ID
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put API_KEY
```

- [ ] **Step 4: デプロイ**

```bash
cd apps/invoice && npx wrangler deploy
```

Expected: `Published invoice-worker`

- [ ] **Step 5: 動作確認**

```bash
# ヘルスチェック
curl https://invoice-worker.<account>.workers.dev/health

# UI表示確認
# ブラウザで https://invoice-worker.<account>.workers.dev/?key=<API_KEY> を開く
```

- [ ] **Step 6: コミット（wrangler.toml等の微調整があれば）**

```bash
git add apps/invoice/
git commit -m "chore(invoice): configure R2 bucket and Notion integration"
```

---

## Task 7: E2E動作確認 + バグ修正

**Files:**
- Potentially any file in `apps/invoice/src/`

- [ ] **Step 1: 抽出テスト**

UIから実際のfriend名を入力して:
1. friendsテーブルで検索できるか
2. messages_logからチャット履歴が取得できるか
3. AIが品目・金額を正しく抽出するか

- [ ] **Step 2: PDF生成テスト**

1. 保存してPDF生成が完了するか
2. PDFレイアウトがMisocaスクリーンショットと一致するか
3. 日本語フォントが正しく表示されるか
4. 金額のフォーマット（カンマ区切り）が正しいか

- [ ] **Step 3: Notion蓄積テスト**

1. Notion DBにレコードが作成されるか
2. 品目JSON、元チャット要約が正しく保存されるか
3. PDF URLがNotionに記録されるか
4. ステータス変更が反映されるか

- [ ] **Step 4: 複製テスト**

1. 見積書→請求書の複製ができるか
2. 複製後の請求番号が新規採番されるか

- [ ] **Step 5: バグ修正 + コミット**

発見したバグを修正:
```bash
git add apps/invoice/
git commit -m "fix(invoice): fix issues found during E2E testing"
```

---

## 補足: フォントサブセットの文字セット

PDF生成で使う日本語フォントのサブセットには以下の文字を含める:
- ASCII英数記号全て
- ひらがな全て
- カタカナ全て
- JIS第1水準漢字（2,965字）
- 追加: 請求書で使う固有名詞の漢字

フルフォント(4MB+)をバンドルするとWorkerサイズ制限(10MB)に抵触する可能性があるため、サブセット化は必須。pyftsubsetで500KB-1MB程度に圧縮する。
