import { describe, expect, it, vi } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  processBalilingualEstimateReminders,
} from '../services/balilingual-estimate-reminder-cron.js';

const OTHER_ACCOUNT_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';

type FriendRow = {
  id: string;
  line_user_id: string;
  line_account_id: string | null;
  is_following: number;
  metadata: string | null;
  tags?: string[];
  hasBooking?: boolean;
};

class FakeDb {
  friends: FriendRow[];
  updates: Array<{ friendId: string; lineAccountId: string; metadata: Record<string, unknown> }> = [];
  logs: Array<{ friendId: string; messageType: string; content: string }> = [];
  selectBindArgs: unknown[] = [];

  constructor(friends: FriendRow[]) {
    this.friends = friends;
  }

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async all<T>() {
            if (sql.includes('FROM friends f')) {
              db.selectBindArgs = args;
              const accountId = String(args[0]);
              const rows = db.friends.filter((friend) => {
                const metadata = parseMetadata(friend.metadata);
                return friend.line_account_id === accountId &&
                  friend.is_following === 1 &&
                  typeof metadata.last_estimate_sent_at === 'string' &&
                  !friend.hasBooking &&
                  !(friend.tags ?? []).some((tag) => ['相談予約済', '面談希望', '配信停止', '配信停止_v4'].includes(tag));
              });
              return { results: rows as T[] };
            }
            return { results: [] as T[] };
          },
          async run() {
            if (sql.includes('UPDATE friends')) {
              const [metadata, _updatedAt, friendId, lineAccountId] = args;
              const friend = db.friends.find((item) => item.id === friendId && item.line_account_id === lineAccountId);
              if (friend) friend.metadata = String(metadata);
              db.updates.push({
                friendId: String(friendId),
                lineAccountId: String(lineAccountId),
                metadata: parseMetadata(String(metadata)),
              });
            }
            if (sql.includes('INSERT INTO messages_log')) {
              const [_id, friendId, messageType, content] = args;
              db.logs.push({
                friendId: String(friendId),
                messageType: String(messageType),
                content: String(content),
              });
            }
            return { success: true };
          },
        };
      },
    };
  }
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function isoHoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function friend(
  id: string,
  metadata: Record<string, unknown>,
  overrides: Partial<FriendRow> = {},
): FriendRow {
  return {
    id,
    line_user_id: `line-${id}`,
    line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
    is_following: 1,
    metadata: JSON.stringify(metadata),
    ...overrides,
  };
}

function lineClient() {
  return {
    pushMessage: vi.fn(async (_userId: string, _messages: unknown[]) => undefined),
  };
}

describe('processBalilingualEstimateReminders', () => {
  it('sends 24h, 5d, and 14d reminders and records metadata plus message logs', async () => {
    const now = new Date('2026-05-14T03:00:00.000Z');
    const db = new FakeDb([
      friend('f24', { last_estimate_sent_at: isoHoursAgo(now, 24) }),
      friend('f5d', { last_estimate_sent_at: isoHoursAgo(now, 5 * 24) }),
      friend('f14d', { last_estimate_sent_at: isoHoursAgo(now, 14 * 24) }),
    ]);
    const client = lineClient();

    const result = await processBalilingualEstimateReminders(db as unknown as D1Database, client, now);

    expect(result).toEqual([
      { friendId: 'f24', stage: '24h' },
      { friendId: 'f5d', stage: '5d' },
      { friendId: 'f14d', stage: '14d' },
    ]);
    expect(client.pushMessage).toHaveBeenCalledTimes(3);
    expect(db.updates).toHaveLength(3);
    expect(db.updates.map((item) => item.lineAccountId)).toEqual([
      BALILINGUAL_LINE_ACCOUNT_ID,
      BALILINGUAL_LINE_ACCOUNT_ID,
      BALILINGUAL_LINE_ACCOUNT_ID,
    ]);
    expect(db.updates[0].metadata.last_reminder_24h_sent_at).toBe(now.toISOString());
    expect(db.updates[1].metadata.last_reminder_5d_sent_at).toBe(now.toISOString());
    expect(db.updates[2].metadata.last_reminder_14d_sent_at).toBe(now.toISOString());
    expect(db.logs.map((item) => item.friendId)).toEqual(['f24', 'f5d', 'f14d']);
  });

  it('does not send the same reminder twice when metadata already has the stage timestamp', async () => {
    const now = new Date('2026-05-14T03:00:00.000Z');
    const db = new FakeDb([
      friend('done', {
        last_estimate_sent_at: isoHoursAgo(now, 24),
        last_reminder_24h_sent_at: '2026-05-14T02:30:00.000Z',
      }),
    ]);
    const client = lineClient();

    const result = await processBalilingualEstimateReminders(db as unknown as D1Database, client, now);

    expect(result).toEqual([]);
    expect(client.pushMessage).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    expect(db.logs).toHaveLength(0);
  });

  it('keeps the target filter scoped to Balilingual main and excludes booked or stopped friends', async () => {
    const now = new Date('2026-05-14T03:00:00.000Z');
    const db = new FakeDb([
      friend('target', { last_estimate_sent_at: isoHoursAgo(now, 24) }),
      friend('other-account', { last_estimate_sent_at: isoHoursAgo(now, 24) }, { line_account_id: OTHER_ACCOUNT_ID }),
      friend('booked-tag', { last_estimate_sent_at: isoHoursAgo(now, 24) }, { tags: ['相談予約済'] }),
      friend('booked-table', { last_estimate_sent_at: isoHoursAgo(now, 24) }, { hasBooking: true }),
      friend('stopped', { last_estimate_sent_at: isoHoursAgo(now, 24) }, { tags: ['配信停止'] }),
    ]);
    const client = lineClient();

    const result = await processBalilingualEstimateReminders(db as unknown as D1Database, client, now);

    expect(result).toEqual([{ friendId: 'target', stage: '24h' }]);
    expect(client.pushMessage).toHaveBeenCalledTimes(1);
    expect(client.pushMessage.mock.calls[0][0]).toBe('line-target');
    expect(db.selectBindArgs[0]).toBe(BALILINGUAL_LINE_ACCOUNT_ID);
    expect(db.selectBindArgs.at(-1)).toBe(BALILINGUAL_LINE_ACCOUNT_ID);
    expect(db.updates[0].friendId).toBe('target');
  });
});
