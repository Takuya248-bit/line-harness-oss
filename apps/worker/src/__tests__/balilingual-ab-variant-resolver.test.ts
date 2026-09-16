import { describe, expect, it } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
  BALILINGUAL_WELCOME_V4_METADATA_KEY,
  resolveAbVariant,
} from '../services/balilingual-ab-variant-resolver.js';

const OTHER_LINE_ACCOUNT_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';

interface FriendRow {
  id: string;
  line_account_id: string | null;
  metadata: string | null;
}

interface AbTestRow {
  id: string;
  line_account_id: string | null;
  name: string;
  variants: string;
  weights: string;
  assignment_seed: string;
  is_active: number;
  starts_at: string | null;
  ends_at: string | null;
}

interface AssignmentRow {
  id: string;
  ab_test_id: string;
  friend_id: string;
  variant: string;
}

function createMockDb() {
  const friends = new Map<string, FriendRow>();
  const abTests = new Map<string, AbTestRow>();
  const assignments = new Map<string, AssignmentRow>();
  const calls = {
    insertAssignments: 0,
    updateFriendMetadata: 0,
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('FROM friends') && sql.includes('line_account_id = ?')) {
                const [friendId, lineAccountId] = args as [string, string];
                const friend = friends.get(friendId);
                if (!friend || friend.line_account_id !== lineAccountId) return null as T;
                return friend as T;
              }

              if (sql.includes('FROM ab_tests')) {
                const [name, lineAccountId, nowForStart, nowForEnd] = args as [string, string, string, string];
                const test = Array.from(abTests.values()).find((row) => {
                  return (
                    row.name === name &&
                    row.line_account_id === lineAccountId &&
                    row.is_active === 1 &&
                    (!row.starts_at || row.starts_at <= nowForStart) &&
                    (!row.ends_at || row.ends_at >= nowForEnd)
                  );
                });
                return (test ?? null) as T;
              }

              if (sql.includes('FROM ab_assignments')) {
                const [abTestId, friendId] = args as [string, string];
                const assignment = assignments.get(`${abTestId}:${friendId}`);
                return (assignment ? { variant: assignment.variant } : null) as T;
              }

              throw new Error(`Unhandled first SQL: ${sql}`);
            },
            async run() {
              if (sql.includes('INSERT INTO ab_assignments')) {
                const [id, abTestId, friendId, variant] = args as [string, string, string, string];
                assignments.set(`${abTestId}:${friendId}`, { id, ab_test_id: abTestId, friend_id: friendId, variant });
                calls.insertAssignments += 1;
                return { meta: { changes: 1 } };
              }

              if (sql.includes('UPDATE friends') && sql.includes('line_account_id = ?')) {
                const [metadata, _updatedAt, friendId, lineAccountId] = args as [string, string, string, string];
                const friend = friends.get(friendId);
                if (!friend || friend.line_account_id !== lineAccountId) return { meta: { changes: 0 } };
                friend.metadata = metadata;
                calls.updateFriendMetadata += 1;
                return { meta: { changes: 1 } };
              }

              throw new Error(`Unhandled run SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, friends, abTests, assignments, calls };
}

describe('resolveAbVariant', () => {
  it('is idempotent and stores the variant in friend metadata', async () => {
    const { db, friends, abTests, assignments, calls } = createMockDb();
    friends.set('friend-1', { id: 'friend-1', line_account_id: BALILINGUAL_LINE_ACCOUNT_ID, metadata: '{}' });
    abTests.set('ab-1', {
      id: 'ab-1',
      line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
      name: BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
      variants: JSON.stringify(['A_48h', 'B_5days']),
      weights: JSON.stringify([100, 0]),
      assignment_seed: 'balilingual-welcome-v4',
      is_active: 1,
      starts_at: null,
      ends_at: null,
    });

    const first = await resolveAbVariant(db, 'friend-1', BALILINGUAL_WELCOME_V4_AB_TEST_NAME);
    const second = await resolveAbVariant(db, 'friend-1', BALILINGUAL_WELCOME_V4_AB_TEST_NAME);

    expect(first).toBe('A_48h');
    expect(second).toBe('A_48h');
    expect(assignments.size).toBe(1);
    expect(calls.insertAssignments).toBe(1);
    expect(calls.updateFriendMetadata).toBe(1);
    expect(JSON.parse(friends.get('friend-1')?.metadata ?? '{}')).toMatchObject({
      [BALILINGUAL_WELCOME_V4_METADATA_KEY]: 'A_48h',
    });
  });

  it('reuses an existing assignment and repairs missing friend metadata', async () => {
    const { db, friends, abTests, assignments, calls } = createMockDb();
    friends.set('friend-2', { id: 'friend-2', line_account_id: BALILINGUAL_LINE_ACCOUNT_ID, metadata: '{"source":"liff"}' });
    abTests.set('ab-1', {
      id: 'ab-1',
      line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
      name: BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
      variants: JSON.stringify(['A_48h', 'B_5days']),
      weights: JSON.stringify([50, 50]),
      assignment_seed: 'balilingual-welcome-v4',
      is_active: 1,
      starts_at: null,
      ends_at: null,
    });
    assignments.set('ab-1:friend-2', {
      id: 'assignment-1',
      ab_test_id: 'ab-1',
      friend_id: 'friend-2',
      variant: 'B_5days',
    });

    const variant = await resolveAbVariant(db, 'friend-2', BALILINGUAL_WELCOME_V4_AB_TEST_NAME);

    expect(variant).toBe('B_5days');
    expect(calls.insertAssignments).toBe(0);
    expect(calls.updateFriendMetadata).toBe(1);
    expect(JSON.parse(friends.get('friend-2')?.metadata ?? '{}')).toMatchObject({
      source: 'liff',
      [BALILINGUAL_WELCOME_V4_METADATA_KEY]: 'B_5days',
    });
  });

  it('creates a new assignment for an unassigned eligible friend', async () => {
    const { db, friends, abTests, assignments } = createMockDb();
    friends.set('friend-3', { id: 'friend-3', line_account_id: BALILINGUAL_LINE_ACCOUNT_ID, metadata: null });
    abTests.set('ab-1', {
      id: 'ab-1',
      line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
      name: BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
      variants: JSON.stringify(['A_48h', 'B_5days']),
      weights: JSON.stringify([0, 100]),
      assignment_seed: 'balilingual-welcome-v4',
      is_active: 1,
      starts_at: null,
      ends_at: null,
    });

    const variant = await resolveAbVariant(db, 'friend-3', BALILINGUAL_WELCOME_V4_AB_TEST_NAME);

    expect(variant).toBe('B_5days');
    expect(assignments.get('ab-1:friend-3')?.variant).toBe('B_5days');
    expect(JSON.parse(friends.get('friend-3')?.metadata ?? '{}')).toEqual({
      [BALILINGUAL_WELCOME_V4_METADATA_KEY]: 'B_5days',
    });
  });

  it('returns null and does not assign friends from other LINE accounts', async () => {
    const { db, friends, abTests, assignments, calls } = createMockDb();
    friends.set('friend-other', { id: 'friend-other', line_account_id: OTHER_LINE_ACCOUNT_ID, metadata: '{}' });
    abTests.set('ab-1', {
      id: 'ab-1',
      line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
      name: BALILINGUAL_WELCOME_V4_AB_TEST_NAME,
      variants: JSON.stringify(['A_48h', 'B_5days']),
      weights: JSON.stringify([50, 50]),
      assignment_seed: 'balilingual-welcome-v4',
      is_active: 1,
      starts_at: null,
      ends_at: null,
    });

    const variant = await resolveAbVariant(db, 'friend-other', BALILINGUAL_WELCOME_V4_AB_TEST_NAME);

    expect(variant).toBeNull();
    expect(assignments.size).toBe(0);
    expect(calls.updateFriendMetadata).toBe(0);
  });
});
