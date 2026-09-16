import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  BALILINGUAL_SURVEY_COMPLETE_TAG_NAME,
  isBalilingualSurveyCompleteTag,
  sendBalilingualEstimate,
} from '../services/balilingual-send-estimate.js';
import { buildHighValueNotifyText, isBalilingualHighValue } from '../services/balilingual-high-value-notify.js';

const { notifyTelegramSimple } = vi.hoisted(() => ({
  notifyTelegramSimple: vi.fn(),
}));

vi.mock('../services/telegram-notify.js', () => ({
  notifyTelegramSimple,
}));

const OTHER_ACCOUNT_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';

interface FriendRow {
  id: string;
  line_account_id: string | null;
  display_name: string | null;
  metadata: string | null;
}

class FakeDb {
  friend: FriendRow;
  tags = new Map<string, string>();
  updates: Array<{ metadata: string; friendId: string; lineAccountId: string }> = [];

  constructor(friend: FriendRow) {
    this.friend = friend;
  }

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async first<T>() {
            if (sql.includes('FROM friends')) {
              const [friendId, lineAccountId] = args;
              if (friendId === db.friend.id && lineAccountId === db.friend.line_account_id) {
                return db.friend as T;
              }
              return null;
            }
            if (sql.includes('FROM tags')) {
              const [idOrName] = args;
              const name = db.tags.get(String(idOrName));
              return name ? ({ name } as T) : null;
            }
            return null;
          },
          async run() {
            if (sql.includes('UPDATE friends')) {
              const [metadata, _updatedAt, friendId, lineAccountId] = args;
              db.friend.metadata = String(metadata);
              db.updates.push({
                metadata: String(metadata),
                friendId: String(friendId),
                lineAccountId: String(lineAccountId),
              });
            }
            return { success: true };
          },
        };
      },
    };
  }
}

function createFriend(metadata: Record<string, unknown>, accountId = BALILINGUAL_LINE_ACCOUNT_ID): FriendRow {
  return {
    id: 'friend-1',
    line_account_id: accountId,
    display_name: '田中太郎',
    metadata: JSON.stringify(metadata),
  };
}

function createLineClient() {
  return {
    pushMessage: vi.fn(async (_lineUserId: string, _messages: unknown[]) => undefined),
  };
}

beforeEach(() => {
  notifyTelegramSimple.mockReset();
});

describe('sendBalilingualEstimate', () => {
  it('sends estimate flex and saves last estimate metadata for the target account', async () => {
    const db = new FakeDb(createFriend({
      desired_duration: '1month',
      room_type: 'pair',
      plan_interest: 'daily',
    }));
    const lineClient = createLineClient();

    const result = await sendBalilingualEstimate({
      db: db as unknown as D1Database,
      lineClient,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
      friendId: 'friend-1',
      lineUserId: 'line-user-1',
      env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: 'chat' },
    });

    expect(result.sent).toBe(true);
    expect(lineClient.pushMessage).toHaveBeenCalledTimes(1);
    expect(lineClient.pushMessage.mock.calls[0][0]).toBe('line-user-1');
    expect(JSON.stringify(lineClient.pushMessage.mock.calls[0][1][0])).toContain('バリリンガル お見積もり');
    expect(result.estimate?.total).toBe(328000);

    const savedMetadata = JSON.parse(db.updates[0].metadata) as Record<string, unknown>;
    expect(savedMetadata.last_estimate_total).toBe(328000);
    expect(typeof savedMetadata.last_estimate_sent_at).toBe('string');
    expect(db.updates[0].lineAccountId).toBe(BALILINGUAL_LINE_ACCOUNT_ID);
    expect(notifyTelegramSimple).not.toHaveBeenCalled();
  });

  it('does not send or write when the webhook account is not Balilingual main', async () => {
    const db = new FakeDb(createFriend({
      desired_duration: '1month',
      room_type: 'single',
    }, OTHER_ACCOUNT_ID));
    const lineClient = createLineClient();

    const result = await sendBalilingualEstimate({
      db: db as unknown as D1Database,
      lineClient,
      lineAccountId: OTHER_ACCOUNT_ID,
      friendId: 'friend-1',
      lineUserId: 'line-user-1',
    });

    expect(result).toMatchObject({ sent: false, reason: 'line_account_not_target' });
    expect(lineClient.pushMessage).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it('notifies Telegram for high-value parent-child estimate', async () => {
    const db = new FakeDb(createFriend({
      desired_duration: '3months',
      room_type: 'pair',
      plan_interest: 'parent_child',
      parent_child_pax: '2',
    }));
    const lineClient = createLineClient();

    const result = await sendBalilingualEstimate({
      db: db as unknown as D1Database,
      lineClient,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
      friendId: 'friend-1',
      lineUserId: 'line-user-1',
      env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: 'chat' },
    });

    expect(result.sent).toBe(true);
    expect(result.highValueNotified).toBe(true);
    expect(result.estimate?.total).toBe(1596000);
    expect(notifyTelegramSimple).toHaveBeenCalledWith(
      'token',
      'chat',
      '[balilingual] 高単価見込: 田中太郎様, ペア12週 親子2名, 合計1,596,000円, friend_id=friend-1',
    );
  });
});

describe('balilingual high value helpers', () => {
  it('matches threshold, parent-child, and exam_other rules', () => {
    expect(isBalilingualHighValue({ total: 800001, isParentChild: false })).toBe(true);
    expect(isBalilingualHighValue({ total: 800000, isParentChild: false })).toBe(false);
    expect(isBalilingualHighValue({ total: 1000, isParentChild: true })).toBe(true);
    expect(isBalilingualHighValue({ total: 1000, isParentChild: false, planInterest: 'exam_other' })).toBe(true);
  });

  it('formats the staff notification text', () => {
    expect(buildHighValueNotifyText({
      friendId: 'friend-x',
      displayName: '山田花子',
      estimate: {
        weeks: 12,
        plan: 'pair',
        planLabel: 'ペア',
        pax: 3,
        isParentChild: true,
        lines: [],
        subtotal: 1596000,
        total: 1596000,
        notes: [],
        warnings: [],
      },
    })).toBe('[balilingual] 高単価見込: 山田花子様, ペア12週 親子3名, 合計1,596,000円, friend_id=friend-x');
  });
});

describe('isBalilingualSurveyCompleteTag', () => {
  it('requires the target account and the survey completion tag name', async () => {
    const db = new FakeDb(createFriend({}));
    db.tags.set('tag-complete', BALILINGUAL_SURVEY_COMPLETE_TAG_NAME);

    await expect(isBalilingualSurveyCompleteTag(
      db as unknown as D1Database,
      BALILINGUAL_LINE_ACCOUNT_ID,
      'tag-complete',
    )).resolves.toBe(true);
    await expect(isBalilingualSurveyCompleteTag(
      db as unknown as D1Database,
      OTHER_ACCOUNT_ID,
      'tag-complete',
    )).resolves.toBe(false);
    await expect(isBalilingualSurveyCompleteTag(
      db as unknown as D1Database,
      BALILINGUAL_LINE_ACCOUNT_ID,
      'different-tag',
    )).resolves.toBe(false);
  });
});
