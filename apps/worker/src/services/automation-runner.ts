import { getFriendLineAccountId, shouldExecuteForFriend } from './tenant-guard-runtime.js';

export async function shouldRunAutomationForFriend(
  db: D1Database,
  friendId: string | undefined,
  automationAccountId: string | null,
): Promise<boolean> {
  if (!friendId) {
    return true;
  }

  const friendAccountId = await getFriendLineAccountId(db, friendId);
  return shouldExecuteForFriend(friendAccountId, automationAccountId);
}

