import { jstNow } from './utils.js';

export interface FriendField {
  id: string;
  line_account_id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: string | null;
  sort_order: number;
  is_required: number;
  created_at: string;
}

export async function getFriendFields(db: D1Database, lineAccountId: string): Promise<FriendField[]> {
  const r = await db.prepare('SELECT * FROM friend_fields WHERE line_account_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(lineAccountId).all<FriendField>();
  return r.results;
}

export async function createFriendField(
  db: D1Database,
  lineAccountId: string,
  name: string,
  fieldKey: string,
  fieldType: string = 'text',
  options?: string | null,
  sortOrder?: number,
  isRequired?: number,
): Promise<FriendField> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    'INSERT INTO friend_fields (id, line_account_id, name, field_key, field_type, options, sort_order, is_required, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, lineAccountId, name, fieldKey, fieldType, options ?? null, sortOrder ?? 0, isRequired ?? 0, now).run();
  return (await db.prepare('SELECT * FROM friend_fields WHERE id = ?').bind(id).first<FriendField>())!;
}

export async function updateFriendField(
  db: D1Database,
  fieldId: string,
  updates: Partial<Pick<FriendField, 'name' | 'field_key' | 'field_type' | 'options' | 'sort_order' | 'is_required'>>,
): Promise<FriendField | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.field_key !== undefined) { fields.push('field_key = ?'); values.push(updates.field_key); }
  if (updates.field_type !== undefined) { fields.push('field_type = ?'); values.push(updates.field_type); }
  if (updates.options !== undefined) { fields.push('options = ?'); values.push(updates.options); }
  if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
  if (updates.is_required !== undefined) { fields.push('is_required = ?'); values.push(updates.is_required); }
  if (fields.length === 0) return db.prepare('SELECT * FROM friend_fields WHERE id = ?').bind(fieldId).first<FriendField>();
  values.push(fieldId);
  await db.prepare(`UPDATE friend_fields SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return db.prepare('SELECT * FROM friend_fields WHERE id = ?').bind(fieldId).first<FriendField>();
}

export async function deleteFriendField(db: D1Database, fieldId: string): Promise<void> {
  await db.prepare('DELETE FROM friend_fields WHERE id = ?').bind(fieldId).run();
}

export function validateFieldValue(
  fieldType: string,
  options: string | null,
  value: unknown,
): { valid: boolean; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: true };
  }

  switch (fieldType) {
    case 'text':
      if (typeof value !== 'string') return { valid: false, error: 'Value must be a string' };
      return { valid: true };

    case 'number':
      if (typeof value === 'string' && isNaN(Number(value))) return { valid: false, error: 'Value must be a number' };
      if (typeof value !== 'string' && typeof value !== 'number') return { valid: false, error: 'Value must be a number' };
      return { valid: true };

    case 'date':
      if (typeof value !== 'string') return { valid: false, error: 'Value must be a date string' };
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return { valid: false, error: 'Value must be in YYYY-MM-DD format' };
      return { valid: true };

    case 'select': {
      if (typeof value !== 'string') return { valid: false, error: 'Value must be a string' };
      if (!options) return { valid: false, error: 'No options defined for select field' };
      const opts: string[] = JSON.parse(options);
      if (!opts.includes(value)) return { valid: false, error: `Value must be one of: ${opts.join(', ')}` };
      return { valid: true };
    }

    case 'multi_select': {
      if (typeof value !== 'string') return { valid: false, error: 'Value must be a JSON array string' };
      let vals: string[];
      try { vals = JSON.parse(value); } catch { return { valid: false, error: 'Value must be a valid JSON array' }; }
      if (!Array.isArray(vals)) return { valid: false, error: 'Value must be a JSON array' };
      if (!options) return { valid: false, error: 'No options defined for multi_select field' };
      const allowed: string[] = JSON.parse(options);
      const invalid = vals.filter(v => !allowed.includes(v));
      if (invalid.length > 0) return { valid: false, error: `Invalid values: ${invalid.join(', ')}` };
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown field type: ${fieldType}` };
  }
}
