export function shouldExecuteForFriend(
  friendAccountId: string | null,
  automationAccountId: string | null,
): boolean {
  if (automationAccountId === null) {
    console.warn(`cross-tenant legacy automation account is null: friend=${friendAccountId}`);
    return true;
  }

  if (friendAccountId === automationAccountId) {
    return true;
  }

  console.warn(`cross-tenant execution blocked: friend=${friendAccountId} automation=${automationAccountId}`);
  return false;
}

export async function getFriendLineAccountId(
  db: D1Database,
  friendId: string,
): Promise<string | null> {
  const friend = await db
    .prepare('SELECT line_account_id FROM friends WHERE id = ? LIMIT 1')
    .bind(friendId)
    .first<{ line_account_id: string | null }>();

  return friend?.line_account_id ?? null;
}

