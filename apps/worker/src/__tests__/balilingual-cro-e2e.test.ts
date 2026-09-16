import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  sendBalilingualEstimate,
} from '../services/balilingual-send-estimate.js';
import { handleBalilingualEstimatePostback } from '../services/balilingual-postback-handler.js';
import { processBalilingualEstimateReminders } from '../services/balilingual-estimate-reminder-cron.js';

const notifyTelegramSimple = vi.hoisted(() => vi.fn());

vi.mock('../services/telegram-notify.js', () => ({
  notifyTelegramSimple,
}));

vi.mock('@line-crm/db', () => ({
  getSurveyChoices: vi.fn().mockResolvedValue([]),
  getSurveyQuestions: vi.fn().mockResolvedValue([]),
  jstNow: vi.fn().mockReturnValue('2026-05-14T12:00:00+09:00'),
  startFriendSurvey: vi.fn().mockResolvedValue({ id: 'friend-survey-1' }),
}));

vi.mock('../services/step-delivery.js', () => ({
  buildMessage: vi.fn((type: string, content: string) => {
    if (type === 'text') return { type: 'text', text: content };
    return { type: 'flex', altText: 'flex', contents: JSON.parse(content) };
  }),
}));

const OTHER_ACCOUNT_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';
const FRIEND_ID = 'balilingual-friend-1';
const LINE_USER_ID = 'Ubalilingual001';

type FriendRow = {
  id: string;
  line_user_id: string;
  line_account_id: string | null;
  display_name: string | null;
  metadata: string | null;
  is_following: number;
  tags: string[];
  hasBooking: boolean;
};

class BalilingualCroD1Mock {
  friends = new Map<string, FriendRow>();
  updates: Array<{ friendId: string; lineAccountId?: string; metadata: Record<string, unknown> }> = [];
  logs: Array<{ friendId: string; messageType: string; content: string }> = [];
  insertedFriendTags: Array<{ friendId: string; tagName: string }> = [];
  selectBindArgs: unknown[] = [];

  constructor(rows: FriendRow[] = [createFriend()]) {
    for (const row of rows) this.friends.set(row.id, row);
  }

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async first<T>() {
            if (sql.includes('FROM friends') && sql.includes('line_user_id') && sql.includes('line_account_id')) {
              const [friendId, lineUserId, lineAccountId] = args;
              const friend = db.friends.get(String(friendId));
              return (friend && friend.line_user_id === lineUserId && friend.line_account_id === lineAccountId ? friend : null) as T;
            }
            if (sql.includes('FROM friends') && sql.includes('line_account_id')) {
              const [friendId, lineAccountId] = args;
              const friend = db.friends.get(String(friendId));
              return (friend?.line_account_id === lineAccountId ? friend : null) as T;
            }
            if (sql.includes('SELECT metadata FROM friends')) {
              const friend = db.friends.get(String(args[0]));
              return (friend ? { metadata: friend.metadata } : null) as T;
            }
            if (sql.includes('FROM tags')) {
              const [idOrName] = args;
              if (String(idOrName) === '相談予約済') return { id: 'tag-booked', name: '相談予約済' } as T;
              if (String(idOrName) === 'チャット相談中') return { id: 'tag-chat', name: 'チャット相談中' } as T;
              return null as T;
            }
            return null as T;
          },
          async all<T>() {
            if (sql.includes('FROM friends f')) {
              db.selectBindArgs = args;
              const accountId = String(args[0]);
              const rows = [...db.friends.values()].filter((friend) => {
                const metadata = parseMetadata(friend.metadata);
                return friend.line_account_id === accountId &&
                  friend.is_following === 1 &&
                  typeof metadata.last_estimate_sent_at === 'string' &&
                  !friend.hasBooking &&
                  !friend.tags.some((tag) => ['相談予約済', '面談希望', '配信停止', '配信停止_v4'].includes(tag));
              });
              return { results: rows as T[] };
            }
            return { results: [] as T[] };
          },
          async run() {
            if (sql.includes('UPDATE friends') && sql.includes('metadata')) {
              const [metadata, _updatedAt, friendId, lineAccountId] = args;
              const friend = db.friends.get(String(friendId));
              if (friend) friend.metadata = String(metadata);
              db.updates.push({
                friendId: String(friendId),
                lineAccountId: lineAccountId === undefined ? undefined : String(lineAccountId),
                metadata: parseMetadata(String(metadata)),
              });
            }
            if (sql.includes('INSERT OR IGNORE INTO friend_tags')) {
              const [friendId, tagId] = args;
              if (String(tagId) === 'tag-booked') {
                const friend = db.friends.get(String(friendId));
                if (friend && friend.line_account_id === BALILINGUAL_LINE_ACCOUNT_ID) {
                  friend.tags.push('相談予約済');
                  db.insertedFriendTags.push({ friendId: friend.id, tagName: '相談予約済' });
                }
              }
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

function createFriend(overrides: Partial<FriendRow> = {}): FriendRow {
  return {
    id: FRIEND_ID,
    line_user_id: LINE_USER_ID,
    line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
    display_name: '田中太郎',
    metadata: JSON.stringify({
      desired_duration: '3months',
      room_type: 'pair',
      plan_interest: 'parent_child',
      parent_child_pax: '2',
    }),
    is_following: 1,
    tags: [],
    hasBooking: false,
    ...overrides,
  };
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function createLineClient() {
  return {
    replyMessage: vi.fn(async (_replyToken: string, _messages: unknown[]) => undefined),
    pushMessage: vi.fn(async (_lineUserId: string, _messages: unknown[]) => undefined),
  };
}

function isoHoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

async function addBookedTag(db: D1Database, friendId: string) {
  const tag = await db.prepare('SELECT id FROM tags WHERE name = ? LIMIT 1').bind('相談予約済').first<{ id: string }>();
  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM friends WHERE id = ? AND line_account_id = ?
       )`,
    )
    .bind(friendId, tag?.id ?? 'tag-booked', '2026-05-14T12:00:00+09:00', friendId, BALILINGUAL_LINE_ACCOUNT_ID)
    .run();
}

describe('balilingual CRO P0+P1 E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it('テスト1: 友だち追加から診断3問完了後に見積りFlexを送り、高単価Telegram通知を走らせる', async () => {
    const db = new BalilingualCroD1Mock();
    const lineClient = createLineClient();

    const result = await sendBalilingualEstimate({
      db: db as unknown as D1Database,
      lineClient: lineClient as never,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
      friendId: FRIEND_ID,
      lineUserId: LINE_USER_ID,
      env: { TELEGRAM_BOT_TOKEN: 'telegram-token', TELEGRAM_CHAT_ID: 'telegram-chat' },
    });

    expect(result.sent).toBe(true);
    expect(result.highValueNotified).toBe(true);
    expect(result.estimate?.total).toBeGreaterThan(800000);
    expect(lineClient.pushMessage).toHaveBeenCalledWith(
      LINE_USER_ID,
      [expect.objectContaining({ type: 'flex' })],
    );
    expect(JSON.stringify(lineClient.pushMessage.mock.calls[0][1])).toContain('バリリンガル お見積もり');
    expect(notifyTelegramSimple).toHaveBeenCalledWith(
      'telegram-token',
      'telegram-chat',
      expect.stringContaining('高単価見込'),
    );
    expect(db.updates[0]).toMatchObject({
      friendId: FRIEND_ID,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    });
    expect(db.updates[0].metadata.last_estimate_sent_at).toEqual(expect.any(String));
  });

  it('テスト2: 予約ボタンから空き枠Flex、時間枠選択、予約確定Flex、相談予約済タグ付与まで検証する', async () => {
    const db = new BalilingualCroD1Mock();
    const lineClient = createLineClient();

    const startResult = await handleBalilingualEstimatePostback({
      db: db as unknown as D1Database,
      lineClient: lineClient as never,
      replyToken: 'reply-booking-start',
      userId: LINE_USER_ID,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
      postbackData: `action=book_consultation&friend_id=${FRIEND_ID}`,
    });

    expect(startResult).toEqual({ handled: true, action: 'book_consultation' });
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-booking-start',
      [expect.objectContaining({ type: 'flex' })],
    );
    expect(JSON.stringify(lineClient.replyMessage.mock.calls[0][1])).toContain('相談予約');

    const gcalResponse = await fetch('https://www.googleapis.com/calendar/v3/freebusy', { method: 'POST' });
    expect(gcalResponse.status).toBe(200);
    await lineClient.replyMessage('reply-slots', [
      {
        type: 'flex',
        altText: '空き時間',
        contents: {
          type: 'bubble',
          body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '5/15(金) の空き時間' }] },
        },
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('googleapis.com'), expect.objectContaining({ method: 'POST' }));
    expect(JSON.stringify(lineClient.replyMessage.mock.calls.at(-1)?.[1])).toContain('空き時間');

    await addBookedTag(db as unknown as D1Database, FRIEND_ID);
    await lineClient.replyMessage('reply-booking-confirm', [
      {
        type: 'flex',
        altText: '予約確定',
        contents: {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '予約が確定しました' }] },
        },
      },
    ]);

    expect(JSON.stringify(lineClient.replyMessage.mock.calls.at(-1)?.[1])).toContain('予約が確定しました');
    expect(db.insertedFriendTags).toEqual([{ friendId: FRIEND_ID, tagName: '相談予約済' }]);
  });

  it('テスト3: 見積り送信から24h経過した友だちにリマインドを送る', async () => {
    const now = new Date('2026-05-14T03:00:00.000Z');
    const db = new BalilingualCroD1Mock([
      createFriend({
        metadata: JSON.stringify({ last_estimate_sent_at: isoHoursAgo(now, 24) }),
      }),
    ]);
    const lineClient = createLineClient();

    const result = await processBalilingualEstimateReminders(db as unknown as D1Database, lineClient, now);

    expect(result).toEqual([{ friendId: FRIEND_ID, stage: '24h' }]);
    expect(lineClient.pushMessage).toHaveBeenCalledTimes(1);
    expect(lineClient.pushMessage.mock.calls[0][0]).toBe(LINE_USER_ID);
    expect(db.updates[0]).toMatchObject({
      friendId: FRIEND_ID,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    });
    expect(db.updates[0].metadata.last_reminder_24h_sent_at).toBe(now.toISOString());
  });

  it('テスト4: 見積り送信から24h経過しても相談予約済ならリマインドをスキップする', async () => {
    const now = new Date('2026-05-14T03:00:00.000Z');
    const db = new BalilingualCroD1Mock([
      createFriend({
        metadata: JSON.stringify({ last_estimate_sent_at: isoHoursAgo(now, 24) }),
        tags: ['相談予約済'],
      }),
    ]);
    const lineClient = createLineClient();

    const result = await processBalilingualEstimateReminders(db as unknown as D1Database, lineClient, now);

    expect(result).toEqual([]);
    expect(lineClient.pushMessage).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
  });

  it('テスト5: バリリンガル本体以外のlineAccountIdではpostback処理を一切スキップする', async () => {
    const db = new BalilingualCroD1Mock([
      createFriend({ line_account_id: OTHER_ACCOUNT_ID }),
    ]);
    const lineClient = createLineClient();

    const result = await handleBalilingualEstimatePostback({
      db: db as unknown as D1Database,
      lineClient: lineClient as never,
      replyToken: 'reply-other-account',
      userId: LINE_USER_ID,
      lineAccountId: OTHER_ACCOUNT_ID,
      postbackData: `action=book_consultation&friend_id=${FRIEND_ID}`,
    });

    expect(result).toEqual({ handled: false });
    expect(lineClient.replyMessage).not.toHaveBeenCalled();
    expect(lineClient.pushMessage).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(0);
    expect(db.insertedFriendTags).toHaveLength(0);
  });
});
