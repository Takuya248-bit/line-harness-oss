# X投稿管理ダッシュボード 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 腸活サプリ会社のX運用代行用ダッシュボード（投稿管理・承認・パフォーマンス表示）を構築する

**Architecture:** Cloudflare Workers(Hono) + D1 + Pages(React/Vite)。認証はCloudflare Access。投稿実行・メトリクス収集はGitHub Actions + bird CLI。

**Tech Stack:** TypeScript, Hono, D1(SQLite), React, Vite, Tailwind CSS, Recharts(グラフ), bird CLI

---

## ファイル構成

```
x-dashboard/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/                    # Worker (Hono API)
│   ├── index.ts            # エントリポイント
│   ├── db/
│   │   └── schema.sql      # D1マイグレーション
│   ├── routes/
│   │   ├── posts.ts        # 投稿CRUD + 承認
│   │   ├── metrics.ts      # パフォーマンスAPI
│   │   ├── followers.ts    # フォロワー推移API
│   │   └── calendar.ts     # カレンダーAPI
│   ├── middleware/
│   │   └── auth.ts         # Cloudflare Access検証 + ロール判定
│   └── types.ts            # 型定義
├── web/                    # Pages (React SPA)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx         # ルーティング
│   │   ├── api.ts          # APIクライアント
│   │   ├── types.ts        # 共有型定義
│   │   ├── components/
│   │   │   ├── Layout.tsx          # 共通レイアウト+ナビ
│   │   │   ├── StatusBadge.tsx     # ステータスバッジ
│   │   │   ├── PostCard.tsx        # 投稿カード（スレッド対応）
│   │   │   ├── PostForm.tsx        # 投稿作成・編集フォーム（スレッド対応）
│   │   │   ├── ApprovalButtons.tsx # 承認/却下ボタン
│   │   │   └── KpiCard.tsx         # KPI表示カード
│   │   └── pages/
│   │       ├── Dashboard.tsx   # ダッシュボード
│   │       ├── Posts.tsx       # 投稿一覧
│   │       ├── Calendar.tsx    # カレンダー
│   │       └── Analytics.tsx   # パフォーマンス
```

---

## Task 1: プロジェクト初期化 + D1スキーマ

**Files:**
- Create: `x-dashboard/package.json`
- Create: `x-dashboard/wrangler.toml`
- Create: `x-dashboard/tsconfig.json`
- Create: `x-dashboard/src/db/schema.sql`

- [ ] **Step 1: ディレクトリ作成 + package.json**

```bash
mkdir -p x-dashboard/src/db
```

```json
{
  "name": "x-dashboard",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:migrate": "wrangler d1 execute x-dashboard-db --local --file=src/db/schema.sql",
    "db:migrate:remote": "wrangler d1 execute x-dashboard-db --remote --file=src/db/schema.sql"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250327.0",
    "typescript": "^5.7.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: wrangler.toml**

```toml
name = "x-dashboard"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "x-dashboard-db"
```

注意: database_idはD1作成後に追記する。wrangler.tomlにはdatabase_idを直接書かず、`wrangler d1 create x-dashboard-db`実行後に取得して記入する。

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: schema.sql**

```sql
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  media_urls TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  thread_id TEXT,
  thread_order INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  posted_at TEXT,
  tweet_id TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id),
  impressions INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  retweets INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS follower_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_metrics_post_id ON metrics(post_id);
```

- [ ] **Step 5: npm install + ローカルDBマイグレーション**

```bash
cd x-dashboard && npm install
npx wrangler d1 create x-dashboard-db
# 出力されたdatabase_idをwrangler.tomlに記入
npm run db:migrate
```

- [ ] **Step 6: コミット**

```bash
git add x-dashboard/
git commit -m "feat(x-dashboard): プロジェクト初期化 + D1スキーマ"
```

---

## Task 2: 型定義 + 認証ミドルウェア

**Files:**
- Create: `x-dashboard/src/types.ts`
- Create: `x-dashboard/src/middleware/auth.ts`

- [ ] **Step 1: 型定義**

```typescript
// src/types.ts
export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'posted';

export interface Post {
  id: string;
  content: string;
  media_urls: string | null;
  status: PostStatus;
  thread_id: string | null;
  thread_order: number;
  scheduled_at: string | null;
  posted_at: string | null;
  tweet_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Metric {
  id: number;
  post_id: string;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  collected_at: string;
}

export interface FollowerHistory {
  id: number;
  count: number;
  recorded_at: string;
}

export type UserRole = 'admin' | 'client';

export interface Env {
  DB: D1Database;
  ADMIN_EMAIL: string;
}
```

- [ ] **Step 2: 認証ミドルウェア**

Cloudflare Access はリクエストヘッダー `Cf-Access-Authenticated-User-Email` に認証済みメールを付与する。

```typescript
// src/middleware/auth.ts
import { Context, Next } from 'hono';
import type { Env, UserRole } from '../types';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.req.header('Cf-Access-Authenticated-User-Email');
  if (!email) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const adminEmail = c.env.ADMIN_EMAIL;
  const role: UserRole = email === adminEmail ? 'admin' : 'client';
  c.set('userEmail', email);
  c.set('userRole', role);
  await next();
}

export function requireAdmin(c: Context, next: Next) {
  if (c.get('userRole') !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
}
```

- [ ] **Step 3: コミット**

```bash
git add x-dashboard/src/types.ts x-dashboard/src/middleware/
git commit -m "feat(x-dashboard): 型定義 + 認証ミドルウェア"
```

---

## Task 3: 投稿CRUD + 承認API

**Files:**
- Create: `x-dashboard/src/routes/posts.ts`
- Create: `x-dashboard/src/index.ts`

- [ ] **Step 1: 投稿ルート**

```typescript
// src/routes/posts.ts
import { Hono } from 'hono';
import type { Env, Post } from '../types';
import { requireAdmin } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// 一覧取得（status/日付フィルタ）
app.get('/', async (c) => {
  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');

  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params: string[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (from) {
    sql += ' AND scheduled_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND scheduled_at <= ?';
    params.push(to);
  }

  sql += ' ORDER BY COALESCE(scheduled_at, created_at) DESC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Post>();
  return c.json(results);
});

// 新規作成（admin only）
app.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<{
    content: string;
    media_urls?: string[];
    scheduled_at?: string;
    thread_items?: { content: string; media_urls?: string[] }[];
  }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // 単体投稿
  if (!body.thread_items || body.thread_items.length === 0) {
    await c.env.DB.prepare(
      `INSERT INTO posts (id, content, media_urls, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.content,
      body.media_urls ? JSON.stringify(body.media_urls) : null,
      body.scheduled_at || null,
      now, now
    ).run();
    return c.json({ id }, 201);
  }

  // スレッド投稿
  const batch = [];
  const headId = id;

  // 先頭ツイート
  batch.push(
    c.env.DB.prepare(
      `INSERT INTO posts (id, content, media_urls, thread_id, thread_order, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(headId, body.content, body.media_urls ? JSON.stringify(body.media_urls) : null, headId, body.scheduled_at || null, now, now)
  );

  // 後続ツイート
  for (let i = 0; i < body.thread_items.length; i++) {
    const item = body.thread_items[i];
    batch.push(
      c.env.DB.prepare(
        `INSERT INTO posts (id, content, media_urls, thread_id, thread_order, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), item.content, item.media_urls ? JSON.stringify(item.media_urls) : null,
        headId, i + 1, body.scheduled_at || null, now, now
      )
    );
  }

  await c.env.DB.batch(batch);
  return c.json({ id: headId, thread_count: body.thread_items.length + 1 }, 201);
});

// 編集（admin only, draft/rejectedのみ）
app.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ content?: string; media_urls?: string[]; scheduled_at?: string }>();

  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status !== 'draft' && post.status !== 'rejected') {
    return c.json({ error: 'Can only edit draft or rejected posts' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE posts SET content = ?, media_urls = ?, scheduled_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    body.content ?? post.content,
    body.media_urls ? JSON.stringify(body.media_urls) : post.media_urls,
    body.scheduled_at ?? post.scheduled_at,
    id
  ).run();
  return c.json({ ok: true });
});

// 削除（admin only, draftのみ）
app.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status !== 'draft') return c.json({ error: 'Can only delete drafts' }, 400);

  // スレッドなら全件削除
  if (post.thread_id) {
    await c.env.DB.prepare('DELETE FROM posts WHERE thread_id = ?').bind(post.thread_id).run();
  } else {
    await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  }
  return c.json({ ok: true });
});

// 承認申請（admin only, draft → pending_approval）
app.post('/:id/submit', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status !== 'draft') return c.json({ error: 'Can only submit drafts' }, 400);

  // スレッドなら全件更新
  const target = post.thread_id || id;
  await c.env.DB.prepare(
    `UPDATE posts SET status = 'pending_approval', updated_at = datetime('now')
     WHERE id = ? OR thread_id = ?`
  ).bind(target, target).run();
  return c.json({ ok: true });
});

// 承認（client, pending_approval → approved）
app.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status !== 'pending_approval') return c.json({ error: 'Not pending approval' }, 400);

  const target = post.thread_id || id;
  await c.env.DB.prepare(
    `UPDATE posts SET status = 'approved', rejection_reason = NULL, updated_at = datetime('now')
     WHERE id = ? OR thread_id = ?`
  ).bind(target, target).run();
  return c.json({ ok: true });
});

// 却下（client, pending_approval → rejected）
app.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ reason?: string }>();
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>();
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (post.status !== 'pending_approval') return c.json({ error: 'Not pending approval' }, 400);

  const target = post.thread_id || id;
  await c.env.DB.prepare(
    `UPDATE posts SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
     WHERE id = ? OR thread_id = ?`
  ).bind(body.reason || null, target, target).run();
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 2: エントリポイント**

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import posts from './routes/posts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('/api/*', authMiddleware);
app.route('/api/posts', posts);

app.get('/health', (c) => c.json({ ok: true }));

export default app;
```

- [ ] **Step 3: tsc --noEmitで型チェック**

```bash
cd x-dashboard && npx tsc --noEmit
```

Expected: エラー0

- [ ] **Step 4: コミット**

```bash
git add x-dashboard/src/
git commit -m "feat(x-dashboard): 投稿CRUD + 承認API"
```

---

## Task 4: メトリクス・フォロワー・カレンダーAPI

**Files:**
- Create: `x-dashboard/src/routes/metrics.ts`
- Create: `x-dashboard/src/routes/followers.ts`
- Create: `x-dashboard/src/routes/calendar.ts`
- Modify: `x-dashboard/src/index.ts`

- [ ] **Step 1: メトリクスAPI**

```typescript
// src/routes/metrics.ts
import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

// 全体サマリー
app.get('/summary', async (c) => {
  const days = parseInt(c.req.query('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { results } = await c.env.DB.prepare(`
    SELECT
      SUM(m.impressions) as total_impressions,
      SUM(m.likes) as total_likes,
      SUM(m.retweets) as total_retweets,
      SUM(m.replies) as total_replies,
      COUNT(DISTINCT m.post_id) as post_count
    FROM metrics m
    JOIN posts p ON p.id = m.post_id
    WHERE m.collected_at >= ?
    AND m.id IN (SELECT MAX(id) FROM metrics GROUP BY post_id)
  `).bind(since).all();

  return c.json(results[0] || {});
});

// 投稿別パフォーマンス
app.get('/posts', async (c) => {
  const days = parseInt(c.req.query('days') || '7');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.content, p.posted_at, p.tweet_id,
      m.impressions, m.likes, m.retweets, m.replies
    FROM posts p
    JOIN metrics m ON m.post_id = p.id
    WHERE p.status = 'posted' AND p.posted_at >= ?
    AND m.id IN (SELECT MAX(id) FROM metrics WHERE post_id = p.id)
    ORDER BY m.likes DESC
  `).bind(since).all();

  return c.json(results);
});

// メトリクス書き込み（GitHub Actionsから呼ばれる）
app.post('/ingest', async (c) => {
  const body = await c.req.json<{
    post_id: string;
    impressions: number;
    likes: number;
    retweets: number;
    replies: number;
  }>();

  await c.env.DB.prepare(
    `INSERT INTO metrics (post_id, impressions, likes, retweets, replies)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(body.post_id, body.impressions, body.likes, body.retweets, body.replies).run();

  return c.json({ ok: true }, 201);
});

export default app;
```

- [ ] **Step 2: フォロワーAPI**

```typescript
// src/routes/followers.ts
import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

// フォロワー推移取得
app.get('/', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { results } = await c.env.DB.prepare(
    'SELECT count, recorded_at FROM follower_history WHERE recorded_at >= ? ORDER BY recorded_at ASC'
  ).bind(since).all();

  return c.json(results);
});

// フォロワー数書き込み（GitHub Actionsから呼ばれる）
app.post('/ingest', async (c) => {
  const body = await c.req.json<{ count: number }>();
  await c.env.DB.prepare('INSERT INTO follower_history (count) VALUES (?)').bind(body.count).run();
  return c.json({ ok: true }, 201);
});

export default app;
```

- [ ] **Step 3: カレンダーAPI**

```typescript
// src/routes/calendar.ts
import { Hono } from 'hono';
import type { Env, Post } from '../types';

const app = new Hono<{ Bindings: Env }>();

// 月/週カレンダーデータ
app.get('/', async (c) => {
  const month = c.req.query('month'); // YYYY-MM
  if (!month) return c.json({ error: 'month parameter required (YYYY-MM)' }, 400);

  const startDate = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const endDate = new Date(y, m, 0).toISOString().split('T')[0]; // 月末日

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM posts
    WHERE scheduled_at >= ? AND scheduled_at <= ?
    AND (thread_id IS NULL OR thread_order = 0)
    ORDER BY scheduled_at ASC
  `).bind(startDate, endDate + 'T23:59:59').all<Post>();

  // スレッドの子投稿を取得
  const threadIds = results.filter(p => p.thread_id).map(p => p.thread_id);
  let threadChildren: Post[] = [];
  if (threadIds.length > 0) {
    const placeholders = threadIds.map(() => '?').join(',');
    const { results: children } = await c.env.DB.prepare(
      `SELECT * FROM posts WHERE thread_id IN (${placeholders}) AND thread_order > 0 ORDER BY thread_order`
    ).bind(...threadIds).all<Post>();
    threadChildren = children;
  }

  return c.json({ posts: results, threadChildren });
});

export default app;
```

- [ ] **Step 4: index.tsにルート追加**

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import posts from './routes/posts';
import metrics from './routes/metrics';
import followers from './routes/followers';
import calendar from './routes/calendar';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('/api/*', authMiddleware);
app.route('/api/posts', posts);
app.route('/api/metrics', metrics);
app.route('/api/followers', followers);
app.route('/api/calendar', calendar);

app.get('/health', (c) => c.json({ ok: true }));

export default app;
```

- [ ] **Step 5: tsc --noEmit**

```bash
cd x-dashboard && npx tsc --noEmit
```

- [ ] **Step 6: コミット**

```bash
git add x-dashboard/src/
git commit -m "feat(x-dashboard): メトリクス・フォロワー・カレンダーAPI"
```

---

## Task 5: フロント初期化 + 共通コンポーネント

**Files:**
- Create: `x-dashboard/web/package.json`
- Create: `x-dashboard/web/vite.config.ts`
- Create: `x-dashboard/web/tailwind.config.js`
- Create: `x-dashboard/web/postcss.config.js`
- Create: `x-dashboard/web/index.html`
- Create: `x-dashboard/web/tsconfig.json`
- Create: `x-dashboard/web/src/main.tsx`
- Create: `x-dashboard/web/src/App.tsx`
- Create: `x-dashboard/web/src/api.ts`
- Create: `x-dashboard/web/src/types.ts`
- Create: `x-dashboard/web/src/components/Layout.tsx`
- Create: `x-dashboard/web/src/components/StatusBadge.tsx`
- Create: `x-dashboard/web/src/components/KpiCard.tsx`

- [ ] **Step 1: package.json**

```json
{
  "name": "x-dashboard-web",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: vite.config.ts + tailwind + postcss**

```typescript
// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' }
  }
});
```

```javascript
// web/tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

```javascript
// web/postcss.config.js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: index.html + tsconfig.json**

```html
<!-- web/index.html -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>X Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 型定義 + APIクライアント**

```typescript
// web/src/types.ts
export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'posted';

export interface Post {
  id: string;
  content: string;
  media_urls: string | null;
  status: PostStatus;
  thread_id: string | null;
  thread_order: number;
  scheduled_at: string | null;
  posted_at: string | null;
  tweet_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsSummary {
  total_impressions: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  post_count: number;
}

export interface PostMetric {
  id: string;
  content: string;
  posted_at: string;
  tweet_id: string;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
}

export interface FollowerPoint {
  count: number;
  recorded_at: string;
}
```

```typescript
// web/src/api.ts
const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  posts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchJson<Post[]>(`/posts${qs}`);
    },
    create: (body: { content: string; media_urls?: string[]; scheduled_at?: string; thread_items?: { content: string }[] }) =>
      fetchJson<{ id: string }>('/posts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { content?: string; scheduled_at?: string }) =>
      fetchJson('/posts/' + id, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => fetchJson('/posts/' + id, { method: 'DELETE' }),
    submit: (id: string) => fetchJson(`/posts/${id}/submit`, { method: 'POST' }),
    approve: (id: string) => fetchJson(`/posts/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason?: string) =>
      fetchJson(`/posts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },
  metrics: {
    summary: (days = 7) => fetchJson<MetricsSummary>(`/metrics/summary?days=${days}`),
    posts: (days = 7) => fetchJson<PostMetric[]>(`/metrics/posts?days=${days}`),
  },
  followers: {
    list: (days = 30) => fetchJson<FollowerPoint[]>(`/followers?days=${days}`),
  },
  calendar: {
    get: (month: string) => fetchJson<{ posts: Post[]; threadChildren: Post[] }>(`/calendar?month=${month}`),
  },
};

import type { Post, MetricsSummary, PostMetric, FollowerPoint } from './types';
```

- [ ] **Step 5: main.tsx + App.tsx + Layout**

```typescript
// web/src/main.tsx
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
```

```css
/* web/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// web/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Posts } from './pages/Posts';
import { Calendar } from './pages/Calendar';
import { Analytics } from './pages/Analytics';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
```

```tsx
// web/src/components/Layout.tsx
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/posts', label: 'Posts' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/analytics', label: 'Analytics' },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6">
        <span className="font-bold text-lg mr-6">X Dashboard</span>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `text-sm px-3 py-1.5 rounded-md ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: StatusBadge + KpiCard**

```tsx
// web/src/components/StatusBadge.tsx
import type { PostStatus } from '../types';

const styles: Record<PostStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  posted: 'bg-blue-100 text-blue-700',
};

const labels: Record<PostStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  posted: 'Posted',
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
```

```tsx
// web/src/components/KpiCard.tsx
export function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 7: npm install**

```bash
cd x-dashboard/web && npm install
```

- [ ] **Step 8: コミット**

```bash
git add x-dashboard/web/
git commit -m "feat(x-dashboard): フロント初期化 + 共通コンポーネント"
```

---

## Task 6: ダッシュボード画面

**Files:**
- Create: `x-dashboard/web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Dashboard実装**

```tsx
// web/src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import type { Post, MetricsSummary } from '../types';

export function Dashboard() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [recent, setRecent] = useState<Post[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.metrics.summary(7).then(setSummary).catch(() => {});
    api.posts.list().then((posts) => {
      setRecent(posts.slice(0, 5));
      setPendingCount(posts.filter((p) => p.status === 'pending_approval').length);
    });
  }, []);

  const engRate = summary && summary.total_impressions > 0
    ? (((summary.total_likes + summary.total_retweets + summary.total_replies) / summary.total_impressions) * 100).toFixed(2)
    : '0';

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Impressions (7d)" value={summary?.total_impressions?.toLocaleString() ?? '-'} />
        <KpiCard label="Engagement Rate" value={`${engRate}%`} />
        <KpiCard label="Likes (7d)" value={summary?.total_likes?.toLocaleString() ?? '-'} />
        <KpiCard label="Pending Approval" value={pendingCount} />
      </div>
      <h2 className="text-lg font-semibold mb-3">Recent Posts</h2>
      <div className="space-y-2">
        {recent.map((post) => (
          <div key={post.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-start">
            <div>
              <p className="text-sm">{post.content.slice(0, 100)}{post.content.length > 100 ? '...' : ''}</p>
              <p className="text-xs text-gray-400 mt-1">{post.scheduled_at || post.created_at}</p>
            </div>
            <StatusBadge status={post.status} />
          </div>
        ))}
        {recent.length === 0 && <p className="text-gray-400 text-sm">No posts yet</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add x-dashboard/web/src/pages/Dashboard.tsx
git commit -m "feat(x-dashboard): ダッシュボード画面"
```

---

## Task 7: 投稿一覧・作成・承認画面

**Files:**
- Create: `x-dashboard/web/src/pages/Posts.tsx`
- Create: `x-dashboard/web/src/components/PostCard.tsx`
- Create: `x-dashboard/web/src/components/PostForm.tsx`
- Create: `x-dashboard/web/src/components/ApprovalButtons.tsx`

- [ ] **Step 1: PostCard（スレッド対応）**

```tsx
// web/src/components/PostCard.tsx
import { StatusBadge } from './StatusBadge';
import type { Post } from '../types';

interface Props {
  post: Post;
  threadPosts?: Post[];
  onAction?: (action: string, id: string) => void;
  isAdmin: boolean;
}

export function PostCard({ post, threadPosts, onAction, isAdmin }: Props) {
  const isThread = threadPosts && threadPosts.length > 0;
  const allPosts = isThread ? [post, ...threadPosts] : [post];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <StatusBadge status={post.status} />
        {isThread && (
          <span className="text-xs text-gray-400">Thread ({allPosts.length} tweets)</span>
        )}
      </div>
      {allPosts.map((p, i) => (
        <div key={p.id} className={`${i > 0 ? 'ml-4 border-l-2 border-gray-100 pl-3 mt-2' : ''}`}>
          {isThread && <span className="text-xs text-gray-300">{i + 1}/{allPosts.length}</span>}
          <p className="text-sm mt-0.5">{p.content}</p>
        </div>
      ))}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          {post.scheduled_at ? `Scheduled: ${post.scheduled_at}` : 'No schedule'}
        </span>
        <div className="flex gap-2">
          {isAdmin && post.status === 'draft' && (
            <>
              <button onClick={() => onAction?.('edit', post.id)} className="text-xs text-blue-600 hover:underline">Edit</button>
              <button onClick={() => onAction?.('submit', post.id)} className="text-xs text-green-600 hover:underline">Submit</button>
              <button onClick={() => onAction?.('delete', post.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </>
          )}
          {!isAdmin && post.status === 'pending_approval' && (
            <>
              <button onClick={() => onAction?.('approve', post.id)} className="text-xs bg-green-500 text-white px-3 py-1 rounded">Approve</button>
              <button onClick={() => onAction?.('reject', post.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded">Reject</button>
            </>
          )}
          {isAdmin && post.status === 'rejected' && (
            <button onClick={() => onAction?.('edit', post.id)} className="text-xs text-blue-600 hover:underline">Edit & Resubmit</button>
          )}
        </div>
      </div>
      {post.rejection_reason && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
          Rejection reason: {post.rejection_reason}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PostForm（スレッド対応）**

```tsx
// web/src/components/PostForm.tsx
import { useState } from 'react';

interface ThreadItem {
  content: string;
}

interface Props {
  onSubmit: (data: { content: string; scheduled_at?: string; thread_items?: ThreadItem[] }) => void;
  onCancel: () => void;
  initial?: { content: string; scheduled_at?: string };
}

export function PostForm({ onSubmit, onCancel, initial }: Props) {
  const [content, setContent] = useState(initial?.content ?? '');
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at ?? '');
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([]);

  const addThread = () => setThreadItems([...threadItems, { content: '' }]);
  const removeThread = (i: number) => setThreadItems(threadItems.filter((_, idx) => idx !== i));
  const updateThread = (i: number, val: string) => {
    const items = [...threadItems];
    items[i] = { content: val };
    setThreadItems(items);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      content,
      scheduled_at: scheduledAt || undefined,
      thread_items: threadItems.length > 0 ? threadItems : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="text-sm font-medium text-gray-700">Tweet 1</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1"
          rows={3}
          maxLength={280}
          required
        />
        <div className="text-xs text-gray-400 text-right">{content.length}/280</div>
      </div>
      {threadItems.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700">Tweet {i + 2}</label>
            <button type="button" onClick={() => removeThread(i)} className="text-xs text-red-500">Remove</button>
          </div>
          <textarea
            value={item.content}
            onChange={(e) => updateThread(i, e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1"
            rows={3}
            maxLength={280}
            required
          />
          <div className="text-xs text-gray-400 text-right">{item.content.length}/280</div>
        </div>
      ))}
      <button type="button" onClick={addThread} className="text-sm text-blue-600 hover:underline">
        + Add tweet to thread
      </button>
      <div>
        <label className="text-sm font-medium text-gray-700">Schedule</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-2 text-sm mt-1"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
        <button type="submit" className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md">Save Draft</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Posts画面**

```tsx
// web/src/pages/Posts.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { PostCard } from '../components/PostCard';
import { PostForm } from '../components/PostForm';
import type { Post, PostStatus } from '../types';

const tabs: { label: string; value: PostStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Posted', value: 'posted' },
  { label: 'Rejected', value: 'rejected' },
];

export function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<PostStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const isAdmin = true; // TODO: Cloudflare Accessヘッダーから判定

  const load = () => {
    const params: Record<string, string> = {};
    if (tab !== 'all') params.status = tab;
    api.posts.list(params).then(setPosts);
  };

  useEffect(() => { load(); }, [tab]);

  // スレッドをグループ化
  const grouped = posts.reduce<Map<string, Post[]>>((map, post) => {
    const key = post.thread_id || post.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
    return map;
  }, new Map());

  const handleAction = async (action: string, id: string) => {
    if (action === 'submit') { await api.posts.submit(id); load(); }
    else if (action === 'approve') { await api.posts.approve(id); load(); }
    else if (action === 'reject') { setRejectingId(id); }
    else if (action === 'delete') { await api.posts.delete(id); load(); }
  };

  const confirmReject = async () => {
    if (rejectingId) {
      await api.posts.reject(rejectingId, rejectReason);
      setRejectingId(null);
      setRejectReason('');
      load();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Posts</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md">
            New Post
          </button>
        )}
      </div>
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`text-sm px-3 py-1 rounded-md ${tab === t.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {showForm && (
        <div className="mb-4">
          <PostForm
            onSubmit={async (data) => { await api.posts.create(data); setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([key, groupPosts]) => {
          const head = groupPosts.find((p) => p.thread_order === 0) || groupPosts[0];
          const children = groupPosts.filter((p) => p.thread_order > 0).sort((a, b) => a.thread_order - b.thread_order);
          return (
            <PostCard key={key} post={head} threadPosts={children.length > 0 ? children : undefined} onAction={handleAction} isAdmin={isAdmin} />
          );
        })}
      </div>
      {rejectingId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-semibold mb-2">Reject Post</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              rows={3}
            />
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => setRejectingId(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
              <button onClick={confirmReject} className="text-sm bg-red-500 text-white px-4 py-1.5 rounded-md">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: コミット**

```bash
git add x-dashboard/web/src/pages/Posts.tsx x-dashboard/web/src/components/PostCard.tsx x-dashboard/web/src/components/PostForm.tsx
git commit -m "feat(x-dashboard): 投稿一覧・作成・承認画面"
```

---

## Task 8: カレンダー画面

**Files:**
- Create: `x-dashboard/web/src/pages/Calendar.tsx`

- [ ] **Step 1: Calendar実装**

```tsx
// web/src/pages/Calendar.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import type { Post } from '../types';

function getMonthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = getMonthString(currentDate);

  useEffect(() => {
    api.calendar.get(monthStr).then((data) => setPosts(data.posts));
  }, [monthStr]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const postsByDay = posts.reduce<Record<number, Post[]>>((acc, p) => {
    if (!p.scheduled_at) return acc;
    const day = new Date(p.scheduled_at).getDate();
    if (!acc[day]) acc[day] = [];
    acc[day].push(p);
    return acc;
  }, {});

  const prev = () => setCurrentDate(new Date(year, month - 2, 1));
  const next = () => setCurrentDate(new Date(year, month, 1));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="text-gray-500 hover:text-gray-800">&lt;</button>
          <span className="font-medium">{year}/{String(month).padStart(2, '0')}</span>
          <button onClick={next} className="text-gray-500 hover:text-gray-800">&gt;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white p-2 min-h-[80px]" />
        ))}
        {days.map((day) => (
          <div key={day} className="bg-white p-2 min-h-[80px]">
            <div className="text-xs text-gray-400 mb-1">{day}</div>
            <div className="space-y-1">
              {(postsByDay[day] || []).map((p) => (
                <div key={p.id} className="text-xs truncate">
                  <StatusBadge status={p.status} />
                  <span className="ml-1">{p.content.slice(0, 20)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add x-dashboard/web/src/pages/Calendar.tsx
git commit -m "feat(x-dashboard): カレンダー画面"
```

---

## Task 9: パフォーマンス画面

**Files:**
- Create: `x-dashboard/web/src/pages/Analytics.tsx`

- [ ] **Step 1: Analytics実装**

```tsx
// web/src/pages/Analytics.tsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import { KpiCard } from '../components/KpiCard';
import type { MetricsSummary, PostMetric, FollowerPoint } from '../types';

export function Analytics() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [postMetrics, setPostMetrics] = useState<PostMetric[]>([]);
  const [followers, setFollowers] = useState<FollowerPoint[]>([]);

  useEffect(() => {
    api.metrics.summary(days).then(setSummary).catch(() => {});
    api.metrics.posts(days).then(setPostMetrics).catch(() => {});
    api.followers.list(days).then(setFollowers).catch(() => {});
  }, [days]);

  const followerChange = followers.length >= 2
    ? followers[followers.length - 1].count - followers[0].count
    : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-sm px-3 py-1 rounded-md ${days === d ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Impressions" value={summary?.total_impressions?.toLocaleString() ?? '-'} />
        <KpiCard label="Likes" value={summary?.total_likes?.toLocaleString() ?? '-'} />
        <KpiCard label="Retweets" value={summary?.total_retweets?.toLocaleString() ?? '-'} />
        <KpiCard label="Follower Change" value={followerChange > 0 ? `+${followerChange}` : String(followerChange)} />
      </div>
      {followers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3">Follower Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={followers.map((f) => ({ date: f.recorded_at.split('T')[0], count: f.count }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Top Posts by Engagement</h2>
        <div className="space-y-2">
          {postMetrics.map((pm, i) => (
            <div key={pm.id} className="flex justify-between items-start border-b border-gray-50 pb-2">
              <div>
                <span className="text-xs text-gray-400 mr-2">#{i + 1}</span>
                <span className="text-sm">{pm.content.slice(0, 80)}{pm.content.length > 80 ? '...' : ''}</span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500 whitespace-nowrap ml-4">
                <span>{pm.likes} likes</span>
                <span>{pm.retweets} RT</span>
                <span>{pm.impressions} imp</span>
              </div>
            </div>
          ))}
          {postMetrics.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add x-dashboard/web/src/pages/Analytics.tsx
git commit -m "feat(x-dashboard): パフォーマンス分析画面"
```

---

## Task 10: デプロイ + Cloudflare Access設定

**Files:**
- Modify: `x-dashboard/wrangler.toml`
- Modify: `x-dashboard/package.json`

- [ ] **Step 1: wrangler.tomlにPages設定追加**

```toml
# wrangler.toml に追記
[site]
bucket = "./web/dist"
```

package.jsonのdeployスクリプトを更新:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build:web": "cd web && npm run build",
    "deploy": "npm run build:web && wrangler deploy",
    "db:migrate": "wrangler d1 execute x-dashboard-db --local --file=src/db/schema.sql",
    "db:migrate:remote": "wrangler d1 execute x-dashboard-db --remote --file=src/db/schema.sql"
  }
}
```

- [ ] **Step 2: D1作成 + マイグレーション（リモート）**

```bash
cd x-dashboard
npx wrangler d1 create x-dashboard-db
# 出力されたdatabase_idをwrangler.tomlに記入
npm run db:migrate:remote
```

- [ ] **Step 3: 環境変数設定**

```bash
npx wrangler secret put ADMIN_EMAIL
# 自分のメールアドレスを入力
```

- [ ] **Step 4: デプロイ**

```bash
npm run deploy
```

- [ ] **Step 5: Cloudflare Access設定（ダッシュボードで手動）**

1. Cloudflare Zero Trust > Access > Applications > Add an application
2. Self-hosted: ドメイン設定（x-dashboard.your-domain.com）
3. Policy: Allow → Email で自分+クライアントのメールを追加
4. 動作確認: ブラウザからアクセス → メールOTP → ダッシュボード表示

- [ ] **Step 6: コミット**

```bash
git add x-dashboard/
git commit -m "feat(x-dashboard): デプロイ設定"
```
