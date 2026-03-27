import { jstNow } from './utils.js';

export interface SavedFilter {
  id: string;
  line_account_id: string;
  name: string;
  filter_conditions: string;
  created_at: string;
  updated_at: string;
}

export async function getSavedFilters(db: D1Database, lineAccountId: string): Promise<SavedFilter[]> {
  const r = await db.prepare('SELECT * FROM saved_filters WHERE line_account_id = ? ORDER BY created_at DESC')
    .bind(lineAccountId).all<SavedFilter>();
  return r.results;
}

export async function getSavedFilterById(db: D1Database, filterId: string): Promise<SavedFilter | null> {
  return db.prepare('SELECT * FROM saved_filters WHERE id = ?').bind(filterId).first<SavedFilter>();
}

export async function createSavedFilter(
  db: D1Database,
  lineAccountId: string,
  name: string,
  filterConditions: string,
): Promise<SavedFilter> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO saved_filters (id, line_account_id, name, filter_conditions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, lineAccountId, name, filterConditions, now, now).run();
  return (await getSavedFilterById(db, id))!;
}

export async function updateSavedFilter(
  db: D1Database,
  filterId: string,
  name?: string,
  filterConditions?: string,
): Promise<SavedFilter | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (filterConditions !== undefined) { fields.push('filter_conditions = ?'); values.push(filterConditions); }
  if (fields.length === 0) return getSavedFilterById(db, filterId);
  fields.push('updated_at = ?'); values.push(jstNow());
  values.push(filterId);
  await db.prepare(`UPDATE saved_filters SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getSavedFilterById(db, filterId);
}

export async function deleteSavedFilter(db: D1Database, filterId: string): Promise<void> {
  await db.prepare('DELETE FROM saved_filters WHERE id = ?').bind(filterId).run();
}
