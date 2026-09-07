/**
 * A/B Test assignment & event recording.
 *
 * 設計:
 *   - friend × ab_test に対し variant を1度だけ決定し ab_assignments に保存
 *   - 割当は SHA-256(seed + ab_test_id + friend_id) → 0〜99% 値 → weights から variant 解決
 *   - 同じ入力で必ず同じvariantを返す (再現性)
 *   - イベントは ab_events に追記
 */

export interface AbTestRow {
  id: string;
  line_account_id: string | null;
  name: string;
  variants: string;      // JSON
  weights: string;       // JSON
  assignment_seed: string;
  is_active: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface AbAssignmentRow {
  id: string;
  ab_test_id: string;
  friend_id: string;
  variant: string;
  assigned_at: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 決定的に variant を選ぶ. 同じ (seed, testId, friendId) なら必ず同じ結果.
 */
export async function pickVariant(
  seed: string,
  testId: string,
  friendId: string,
  variants: string[],
  weights: number[],
): Promise<string> {
  if (variants.length === 0) throw new Error('variants empty');
  if (variants.length !== weights.length) throw new Error('variants/weights length mismatch');

  const hash = await sha256Hex(`${seed}:${testId}:${friendId}`);
  // 上位8文字を整数化して0-99%スケール
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return variants[0];
  const normalized = weights.map((w) => Math.round((w / totalWeight) * 100));

  let cum = 0;
  for (let i = 0; i < variants.length; i++) {
    cum += normalized[i];
    if (bucket < cum) return variants[i];
  }
  return variants[variants.length - 1];
}

/**
 * friend × ab_test に variant を確定割当する.
 * 既存assignmentがあればそれを返す (冪等).
 */
export async function assignFriendToVariant(
  db: D1Database,
  abTest: AbTestRow,
  friendId: string,
): Promise<string> {
  // 既存check
  const existing = await db
    .prepare(`SELECT variant FROM ab_assignments WHERE ab_test_id = ? AND friend_id = ?`)
    .bind(abTest.id, friendId)
    .first<{ variant: string }>();
  if (existing) return existing.variant;

  const variants = JSON.parse(abTest.variants) as string[];
  const weights = JSON.parse(abTest.weights) as number[];
  const variant = await pickVariant(abTest.assignment_seed || abTest.id, abTest.id, friendId, variants, weights);

  await db
    .prepare(
      `INSERT INTO ab_assignments (id, ab_test_id, friend_id, variant)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), abTest.id, friendId, variant)
    .run();

  return variant;
}

/**
 * variant 露出イベントを記録 (重複OK).
 */
export async function recordAbEvent(
  db: D1Database,
  abTestId: string,
  friendId: string,
  variant: string,
  eventType: string,
  eventValue?: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ab_events (id, ab_test_id, friend_id, variant, event_type, event_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), abTestId, friendId, variant, eventType, eventValue ?? null)
    .run();
}

/**
 * このアカウントでアクティブな A/B テスト一覧.
 */
export async function getActiveAbTests(
  db: D1Database,
  lineAccountId: string | null,
): Promise<AbTestRow[]> {
  const now = new Date().toISOString();
  const accountClause = lineAccountId ? 'AND (line_account_id = ? OR line_account_id IS NULL)' : '';
  const binds = lineAccountId ? [now, now, lineAccountId] : [now, now];
  const result = await db
    .prepare(
      `SELECT * FROM ab_tests
       WHERE is_active = 1
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
         ${accountClause}
       ORDER BY created_at ASC`,
    )
    .bind(...binds)
    .all<AbTestRow>();
  return result.results;
}
