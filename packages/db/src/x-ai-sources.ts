import { jstNow } from './utils.js';

export interface XAiSource {
  id: string;
  source_type: string;
  external_id: string | null;
  title: string;
  url: string;
  summary: string | null;
  score: number;
  collected_at: string;
  used_in_post: number;
  created_at: string;
}

export interface CreateXAiSourceInput {
  sourceType: string;
  externalId?: string | null;
  title: string;
  url: string;
  summary?: string | null;
  score?: number;
}

export async function createXAiSource(
  db: D1Database,
  input: CreateXAiSourceInput,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT OR IGNORE INTO x_ai_sources
         (id, source_type, external_id, title, url, summary, score, collected_at, used_in_post, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      id,
      input.sourceType,
      input.externalId ?? null,
      input.title,
      input.url,
      input.summary ?? null,
      input.score ?? 0,
      now,
      now,
    )
    .run();
}

export async function getUnusedSources(
  db: D1Database,
  limit: number = 10,
): Promise<XAiSource[]> {
  const result = await db
    .prepare(
      `SELECT * FROM x_ai_sources
       WHERE used_in_post = 0
       ORDER BY score DESC, collected_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<XAiSource>();
  return result.results;
}

export async function markSourceUsed(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare(`UPDATE x_ai_sources SET used_in_post = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function sourceExists(
  db: D1Database,
  sourceType: string,
  externalId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT 1 FROM x_ai_sources WHERE source_type = ? AND external_id = ? LIMIT 1`,
    )
    .bind(sourceType, externalId)
    .first();
  return result !== null;
}
