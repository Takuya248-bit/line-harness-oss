import { jstNow } from './utils.js';

export type XPostType = 'single' | 'thread' | 'reply';
export type XPostStatus = 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed';
export type XPostCategory = 'ai_news' | 'ai_tips' | 'ai_insight' | 'ai_tutorial' | 'engagement';
export type XPostCtaType = 'none' | 'line';

export interface XPost {
  id: string;
  content: string;
  image_url: string | null;
  post_type: XPostType;
  thread_parent_id: string | null;
  status: XPostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  x_post_id: string | null;
  error_message: string | null;
  category: XPostCategory | null;
  cta_type: XPostCtaType;
  ai_generated: number;
  created_at: string;
  updated_at: string;
}

export interface XPostTemplate {
  id: string;
  name: string;
  category: XPostCategory;
  template_text: string;
  cta_type: XPostCtaType;
  variables: string | null;
  is_active: number;
  use_count: number;
  created_at: string;
}

export interface XPostLog {
  id: string;
  x_post_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

// --- XPost CRUD ---

export interface GetXPostsOptions {
  status?: XPostStatus;
  category?: XPostCategory;
  limit?: number;
}

export async function getXPosts(
  db: D1Database,
  options?: GetXPostsOptions,
): Promise<XPost[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options?.status) {
    conditions.push('status = ?');
    values.push(options.status);
  }
  if (options?.category) {
    conditions.push('category = ?');
    values.push(options.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit ? `LIMIT ?` : '';
  if (options?.limit) values.push(options.limit);

  const result = await db
    .prepare(`SELECT * FROM x_posts ${where} ORDER BY created_at DESC ${limit}`)
    .bind(...values)
    .all<XPost>();
  return result.results;
}

export async function getXPostById(
  db: D1Database,
  id: string,
): Promise<XPost | null> {
  return db
    .prepare(`SELECT * FROM x_posts WHERE id = ?`)
    .bind(id)
    .first<XPost>();
}

export interface CreateXPostInput {
  content: string;
  imageUrl?: string | null;
  postType?: XPostType;
  threadParentId?: string | null;
  scheduledAt?: string | null;
  category?: XPostCategory | null;
  ctaType?: XPostCtaType;
  aiGenerated?: boolean;
}

export async function createXPost(
  db: D1Database,
  input: CreateXPostInput,
): Promise<XPost> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const status: XPostStatus = input.scheduledAt ? 'scheduled' : 'draft';

  await db
    .prepare(
      `INSERT INTO x_posts
         (id, content, image_url, post_type, thread_parent_id, status, scheduled_at, posted_at, x_post_id, error_message, category, cta_type, ai_generated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.content,
      input.imageUrl ?? null,
      input.postType ?? 'single',
      input.threadParentId ?? null,
      status,
      input.scheduledAt ?? null,
      input.category ?? null,
      input.ctaType ?? 'none',
      input.aiGenerated ? 1 : 0,
      now,
      now,
    )
    .run();

  return (await getXPostById(db, id))!;
}

export type UpdateXPostInput = Partial<
  Pick<
    XPost,
    | 'content'
    | 'image_url'
    | 'post_type'
    | 'thread_parent_id'
    | 'scheduled_at'
    | 'category'
    | 'cta_type'
    | 'ai_generated'
    | 'status'
  >
>;

export async function updateXPost(
  db: D1Database,
  id: string,
  updates: UpdateXPostInput,
): Promise<XPost> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.image_url !== undefined) {
    fields.push('image_url = ?');
    values.push(updates.image_url);
  }
  if (updates.post_type !== undefined) {
    fields.push('post_type = ?');
    values.push(updates.post_type);
  }
  if (updates.thread_parent_id !== undefined) {
    fields.push('thread_parent_id = ?');
    values.push(updates.thread_parent_id);
  }
  if (updates.scheduled_at !== undefined) {
    fields.push('scheduled_at = ?');
    values.push(updates.scheduled_at);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.cta_type !== undefined) {
    fields.push('cta_type = ?');
    values.push(updates.cta_type);
  }
  if (updates.ai_generated !== undefined) {
    fields.push('ai_generated = ?');
    values.push(updates.ai_generated);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(jstNow());
    values.push(id);
    await db
      .prepare(`UPDATE x_posts SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  return (await getXPostById(db, id))!;
}

export async function updateXPostStatus(
  db: D1Database,
  id: string,
  status: XPostStatus,
  xPostId?: string,
  errorMessage?: string,
): Promise<void> {
  const fields: string[] = ['status = ?', 'updated_at = ?'];
  const values: unknown[] = [status, jstNow()];

  if (status === 'posted') {
    fields.push('posted_at = ?');
    values.push(jstNow());
  }
  if (xPostId !== undefined) {
    fields.push('x_post_id = ?');
    values.push(xPostId);
  }
  if (errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(errorMessage);
  }

  values.push(id);
  await db
    .prepare(`UPDATE x_posts SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteXPost(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM x_posts WHERE id = ?`).bind(id).run();
}

export async function getScheduledXPosts(db: D1Database): Promise<XPost[]> {
  const now = jstNow();
  const result = await db
    .prepare(
      `SELECT * FROM x_posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC`,
    )
    .bind(now)
    .all<XPost>();
  return result.results;
}

// --- XPostTemplate CRUD ---

export async function getXPostTemplates(
  db: D1Database,
  category?: XPostCategory,
): Promise<XPostTemplate[]> {
  if (category) {
    const result = await db
      .prepare(
        `SELECT * FROM x_post_templates WHERE is_active = 1 AND category = ? ORDER BY use_count DESC`,
      )
      .bind(category)
      .all<XPostTemplate>();
    return result.results;
  }
  const result = await db
    .prepare(`SELECT * FROM x_post_templates WHERE is_active = 1 ORDER BY use_count DESC`)
    .all<XPostTemplate>();
  return result.results;
}

export async function getXPostTemplateById(
  db: D1Database,
  id: string,
): Promise<XPostTemplate | null> {
  return db
    .prepare(`SELECT * FROM x_post_templates WHERE id = ?`)
    .bind(id)
    .first<XPostTemplate>();
}

export interface CreateXPostTemplateInput {
  name: string;
  category: XPostCategory;
  templateText: string;
  ctaType?: XPostCtaType;
  variables?: string | null;
}

export async function createXPostTemplate(
  db: D1Database,
  input: CreateXPostTemplateInput,
): Promise<XPostTemplate> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO x_post_templates
         (id, name, category, template_text, cta_type, variables, is_active, use_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    )
    .bind(
      id,
      input.name,
      input.category,
      input.templateText,
      input.ctaType ?? 'line',
      input.variables ?? null,
      now,
    )
    .run();

  return (await getXPostTemplateById(db, id))!;
}

export async function incrementTemplateUseCount(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare(`UPDATE x_post_templates SET use_count = use_count + 1 WHERE id = ?`)
    .bind(id)
    .run();
}

// --- XPostLog CRUD ---

export async function createXPostLog(
  db: D1Database,
  xPostId: string,
  action: string,
  details?: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO x_post_logs (id, x_post_id, action, details, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, xPostId, action, details ?? null, now)
    .run();
}

export async function getXPostLogs(
  db: D1Database,
  xPostId: string,
): Promise<XPostLog[]> {
  const result = await db
    .prepare(`SELECT * FROM x_post_logs WHERE x_post_id = ? ORDER BY created_at DESC`)
    .bind(xPostId)
    .all<XPostLog>();
  return result.results;
}

// --- Ban対策用クエリ ---

/** 今日（JST）投稿済みの件数を取得 */
export async function getDailyPostCount(db: D1Database): Promise<number> {
  const today = jstNow().slice(0, 10); // "YYYY-MM-DD"
  const result = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM x_posts WHERE status = 'posted' AND posted_at >= ?`,
    )
    .bind(`${today} 00:00:00`)
    .first<{ cnt: number }>();
  return result?.cnt ?? 0;
}

/** 直近N件の投稿済みコンテンツを取得（重複チェック用） */
export async function getRecentPostedContent(
  db: D1Database,
  limit: number = 50,
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT content FROM x_posts WHERE status = 'posted' ORDER BY posted_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ content: string }>();
  return result.results.map((r) => r.content);
}

/** 特定の投稿のリトライ回数を取得 */
export async function getPostRetryCount(
  db: D1Database,
  xPostId: string,
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM x_post_logs WHERE x_post_id = ? AND action = 'retry_scheduled'`,
    )
    .bind(xPostId)
    .first<{ cnt: number }>();
  return result?.cnt ?? 0;
}
