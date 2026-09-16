import { enrollFriendInScenario as enrollFriendInScenarioDb } from '@line-crm/db';
import type { FriendScenario } from '@line-crm/db';
import { getFriendLineAccountId, shouldExecuteForFriend } from './tenant-guard-runtime.js';

async function getScenarioLineAccountId(
  db: D1Database,
  scenarioId: string,
): Promise<string | null> {
  const scenario = await db
    .prepare('SELECT line_account_id FROM scenarios WHERE id = ? LIMIT 1')
    .bind(scenarioId)
    .first<{ line_account_id: string | null }>();

  return scenario?.line_account_id ?? null;
}

export async function enrollFriendInScenarioGuarded(
  db: D1Database,
  friendId: string,
  scenarioId: string,
  options?: { exclusive?: boolean },
): Promise<FriendScenario | null> {
  const [friendAccountId, scenarioAccountId] = await Promise.all([
    getFriendLineAccountId(db, friendId),
    getScenarioLineAccountId(db, scenarioId),
  ]);

  if (!shouldExecuteForFriend(friendAccountId, scenarioAccountId)) {
    return null;
  }

  return enrollFriendInScenarioDb(db, friendId, scenarioId, options);
}

