import { jstNow } from './utils.js';

/**
 * アクション日時を記録する。
 * - {key}_作成: 初回のみセット
 * - {key}_更新: 毎回上書き
 */
export async function recordActionDate(
  db: D1Database,
  friendId: string,
  key: string,
): Promise<void> {
  const friend = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friendId).first<{ metadata: string }>();
  if (!friend) return;
  const metadata = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
  const now = jstNow().slice(0, 10); // YYYY-MM-DD

  const createKey = `${key}_作成`;
  const updateKey = `${key}_更新`;

  // 作成日は初回のみ
  if (!metadata[createKey]) {
    metadata[createKey] = now;
  }
  // 更新日は毎回
  metadata[updateKey] = now;

  await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(metadata), jstNow(), friendId).run();
}

/**
 * 回数をインクリメントする。
 */
export async function incrementActionCount(
  db: D1Database,
  friendId: string,
  key: string,
): Promise<number> {
  const friend = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friendId).first<{ metadata: string }>();
  if (!friend) return 0;
  const metadata = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;

  const countKey = `${key}_回数`;
  const current = typeof metadata[countKey] === 'number' ? (metadata[countKey] as number) : 0;
  metadata[countKey] = current + 1;

  await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(metadata), jstNow(), friendId).run();

  return current + 1;
}

/**
 * 複数のアクション日時と回数を一括記録する。
 * DB読み書きを1回にまとめてパフォーマンスを最適化。
 */
export async function recordActions(
  db: D1Database,
  friendId: string,
  actions: Array<{ type: 'date' | 'count'; key: string }>,
): Promise<void> {
  const friend = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friendId).first<{ metadata: string }>();
  if (!friend) return;
  const metadata = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
  const now = jstNow().slice(0, 10);

  for (const action of actions) {
    if (action.type === 'date') {
      const createKey = `${action.key}_作成`;
      const updateKey = `${action.key}_更新`;
      if (!metadata[createKey]) metadata[createKey] = now;
      metadata[updateKey] = now;
    } else if (action.type === 'count') {
      const countKey = `${action.key}_回数`;
      const current = typeof metadata[countKey] === 'number' ? (metadata[countKey] as number) : 0;
      metadata[countKey] = current + 1;
    }
  }

  await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(metadata), jstNow(), friendId).run();
}
