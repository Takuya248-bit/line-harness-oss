import { jstNow } from './utils.js';

export interface TagFolder {
  id: string;
  name: string;
  line_account_id: string;
  sort_order: number;
  created_at: string;
}

export async function getTagFolders(
  db: D1Database,
  lineAccountId: string,
): Promise<TagFolder[]> {
  const result = await db
    .prepare(
      `SELECT * FROM tag_folders WHERE line_account_id = ? ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(lineAccountId)
    .all<TagFolder>();
  return result.results;
}

export async function createTagFolder(
  db: D1Database,
  lineAccountId: string,
  name: string,
): Promise<TagFolder> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO tag_folders (id, name, line_account_id, sort_order, created_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(id, name, lineAccountId, now)
    .run();
  return (await db
    .prepare(`SELECT * FROM tag_folders WHERE id = ?`)
    .bind(id)
    .first<TagFolder>())!;
}

export async function updateTagFolder(
  db: D1Database,
  folderId: string,
  name: string,
  sortOrder: number,
): Promise<TagFolder | null> {
  await db
    .prepare(
      `UPDATE tag_folders SET name = ?, sort_order = ? WHERE id = ?`,
    )
    .bind(name, sortOrder, folderId)
    .run();
  return db
    .prepare(`SELECT * FROM tag_folders WHERE id = ?`)
    .bind(folderId)
    .first<TagFolder>();
}

export async function deleteTagFolder(
  db: D1Database,
  folderId: string,
): Promise<void> {
  // Unlink tags from folder (set folder_id to null)
  await db
    .prepare(`UPDATE tags SET folder_id = NULL WHERE folder_id = ?`)
    .bind(folderId)
    .run();
  await db
    .prepare(`DELETE FROM tag_folders WHERE id = ?`)
    .bind(folderId)
    .run();
}

export async function moveTagToFolder(
  db: D1Database,
  tagId: string,
  folderId: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE tags SET folder_id = ? WHERE id = ?`)
    .bind(folderId, tagId)
    .run();
}
