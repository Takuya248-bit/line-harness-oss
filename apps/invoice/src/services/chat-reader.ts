export interface ChatMessage {
  direction: 'incoming' | 'outgoing';
  content: string;
  created_at: string;
}

export interface FriendInfo {
  id: string;
  display_name: string;
}

// バリリンガルのline_account_id
const BARILINGUAL_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';

export async function searchFriend(db: D1Database, name: string): Promise<FriendInfo[]> {
  const result = await db
    .prepare('SELECT id, display_name FROM friends WHERE display_name LIKE ? AND line_account_id = ? LIMIT 10')
    .bind(`%${name}%`, BARILINGUAL_ACCOUNT_ID)
    .all<FriendInfo>();
  return result.results ?? [];
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
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(friendId, sinceStr, limit)
    .all<ChatMessage>();
  const rows = result.results ?? [];
  return rows.reverse();
}
