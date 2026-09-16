#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const BALILINGUAL_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
const DATABASE_NAME = 'line-crm';

type Mode = 'dry-run' | 'apply';

interface QueryResult<T> {
  results?: T[];
  success?: boolean;
  meta?: { changes?: number };
  error?: string;
}

interface FriendRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  line_account_id: string | null;
}

interface CountRow {
  count: number;
}

interface SinceRow {
  started_at: string | null;
}

interface CleanupStep {
  label: string;
  tableName: string;
  countSql: string;
  deleteSql: string;
  skipWhenTableMissing?: boolean;
}

function parseMode(argv: string[]): Mode {
  if (argv.includes('--apply')) return 'apply';
  if (argv.includes('--dry-run')) return 'dry-run';
  return 'dry-run';
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runWranglerSql<T>(sql: string): QueryResult<T> {
  const args = ['exec', 'wrangler', 'd1', 'execute', DATABASE_NAME, '--remote', '--command', sql, '--json'];
  const result = spawnSync('pnpm', args, {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed:\n${result.stderr || result.stdout}`);
  }

  const stdout = result.stdout.trim();
  if (!stdout) return {};

  const parsed = JSON.parse(stdout) as QueryResult<T>[] | QueryResult<T>;
  return Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed;
}

function one<T>(sql: string): T | null {
  const result = runWranglerSql<T>(sql);
  if (result.error) throw new Error(result.error);
  return result.results?.[0] ?? null;
}

function count(sql: string): number {
  return Number(one<CountRow>(sql)?.count ?? 0);
}

function tableExists(tableName: string): boolean {
  const row = one<CountRow>(
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ${sqlString(tableName)};`,
  );
  return Number(row?.count ?? 0) === 1;
}

async function confirmApply(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Type "yes" to apply these deletes: ');
    return answer.trim() === 'yes';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const takuyaLineUserId = process.env.TAKUYA_LINE_USER_ID?.trim();

  if (!takuyaLineUserId) {
    throw new Error('TAKUYA_LINE_USER_ID env is required. Refusing to continue.');
  }

  const accountIdSql = sqlString(BALILINGUAL_LINE_ACCOUNT_ID);
  const lineUserIdSql = sqlString(takuyaLineUserId);
  const friend = one<FriendRow>(
    `SELECT id, line_user_id, display_name, line_account_id
       FROM friends
      WHERE line_user_id = ${lineUserIdSql}
        AND line_account_id = ${accountIdSql}
      LIMIT 1;`,
  );

  if (!friend) {
    throw new Error(
      `No friend found for TAKUYA_LINE_USER_ID in balilingual account ${BALILINGUAL_LINE_ACCOUNT_ID}. Refusing to continue.`,
    );
  }

  if (friend.line_account_id !== BALILINGUAL_LINE_ACCOUNT_ID) {
    throw new Error(`Friend account mismatch: ${friend.line_account_id ?? 'null'}. Refusing to continue.`);
  }

  const friendIdSql = sqlString(friend.id);
  const guardedFriendWhere = `f.id = ${friendIdSql} AND f.line_account_id = ${accountIdSql}`;
  const friendExistsGuard = `EXISTS (SELECT 1 FROM friends f WHERE f.id = friend_id AND ${guardedFriendWhere})`;

  const dryRunStartedAt = one<SinceRow>(
    `SELECT MIN(created_at) AS started_at
       FROM bookings
      WHERE friend_id = ${friendIdSql}
        AND line_account_id = ${accountIdSql}
        AND is_test_booking = 1;`,
  )?.started_at;
  const messageSinceClause = dryRunStartedAt ? ` AND created_at >= ${sqlString(dryRunStartedAt)}` : ' AND 1 = 0';

  const steps: CleanupStep[] = [
    {
      label: 'friend_tags',
      tableName: 'friend_tags',
      countSql: `SELECT COUNT(*) AS count FROM friend_tags WHERE ${friendExistsGuard};`,
      deleteSql: `DELETE FROM friend_tags WHERE ${friendExistsGuard};`,
    },
    {
      label: 'friend_metadata',
      tableName: 'friend_metadata',
      countSql: `SELECT COUNT(*) AS count FROM friend_metadata WHERE ${friendExistsGuard};`,
      deleteSql: `DELETE FROM friend_metadata WHERE ${friendExistsGuard};`,
      skipWhenTableMissing: true,
    },
    {
      label: dryRunStartedAt ? `messages_log since ${dryRunStartedAt}` : 'messages_log since test start (no test booking found)',
      tableName: 'messages_log',
      countSql: `SELECT COUNT(*) AS count FROM messages_log WHERE ${friendExistsGuard}${messageSinceClause};`,
      deleteSql: `DELETE FROM messages_log WHERE ${friendExistsGuard}${messageSinceClause};`,
    },
    {
      label: 'bookings is_test_booking=1',
      tableName: 'bookings',
      countSql: `SELECT COUNT(*) AS count
                   FROM bookings
                  WHERE friend_id = ${friendIdSql}
                    AND line_account_id = ${accountIdSql}
                    AND is_test_booking = 1
                    AND EXISTS (
                      SELECT 1 FROM friends f
                       WHERE f.id = bookings.friend_id
                         AND f.id = ${friendIdSql}
                         AND f.line_account_id = ${accountIdSql}
                    );`,
      deleteSql: `DELETE FROM bookings
                  WHERE friend_id = ${friendIdSql}
                    AND line_account_id = ${accountIdSql}
                    AND is_test_booking = 1
                    AND EXISTS (
                      SELECT 1 FROM friends f
                       WHERE f.id = bookings.friend_id
                         AND f.id = ${friendIdSql}
                         AND f.line_account_id = ${accountIdSql}
                    );`,
    },
    {
      label: 'friend_surveys',
      tableName: 'friend_surveys',
      countSql: `SELECT COUNT(*) AS count FROM friend_surveys WHERE ${friendExistsGuard};`,
      deleteSql: `DELETE FROM friend_surveys WHERE ${friendExistsGuard};`,
    },
    {
      label: 'friend_scenarios',
      tableName: 'friend_scenarios',
      countSql: `SELECT COUNT(*) AS count FROM friend_scenarios WHERE ${friendExistsGuard};`,
      deleteSql: `DELETE FROM friend_scenarios WHERE ${friendExistsGuard};`,
    },
  ];

  const counts = steps.map((step) => {
    const exists = tableExists(step.tableName);
    if (!exists && step.skipWhenTableMissing) return { ...step, exists, count: 0 };
    if (!exists) throw new Error(`Required table missing: ${step.tableName}`);
    return { ...step, exists, count: count(step.countSql) };
  });

  const productionBookingCount = count(
    `SELECT COUNT(*) AS count
       FROM bookings
      WHERE friend_id = ${friendIdSql}
        AND line_account_id = ${accountIdSql}
        AND is_test_booking != 1;`,
  );

  console.log(`mode: ${mode}`);
  console.log(`lineAccountId: ${BALILINGUAL_LINE_ACCOUNT_ID}`);
  console.log(`friend: ${friend.id} (${friend.display_name ?? 'no display name'})`);
  console.log(`TAKUYA_LINE_USER_ID: ${takuyaLineUserId}`);
  console.log(`test message cutoff: ${dryRunStartedAt ?? 'none (messages_log delete count forced to 0)'}`);
  console.log(`production bookings preserved: ${productionBookingCount}`);
  console.log('');

  for (const step of counts) {
    const suffix = step.exists ? '' : ' (table missing; skipped)';
    console.log(`${step.label}: ${step.count}${suffix}`);
  }

  console.log('');
  console.log('SQL to execute in order:');
  for (const step of counts) {
    if (!step.exists) continue;
    console.log(`-- ${step.label}`);
    console.log(step.deleteSql.replace(/\s+/g, ' ').trim());
  }
  console.log('-- friends table is intentionally not deleted.');

  if (mode === 'dry-run') return;

  if (!(await confirmApply())) {
    console.log('Aborted. No rows deleted.');
    return;
  }

  for (const step of counts) {
    if (!step.exists || step.count === 0) continue;
    const result = runWranglerSql(step.deleteSql);
    console.log(`${step.label}: deleted ${result.meta?.changes ?? step.count}`);
  }

  console.log('Cleanup applied. Friend row preserved.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
