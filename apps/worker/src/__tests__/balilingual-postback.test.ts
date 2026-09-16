import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  handleBalilingualEstimatePostback,
  parseBalilingualEstimatePostback,
} from '../services/balilingual-postback-handler.js';

const mocks = vi.hoisted(() => ({
  startFriendSurvey: vi.fn().mockResolvedValue({ id: 'friend-survey-1' }),
}));

vi.mock('@line-crm/db', () => ({
  getSurveyChoices: vi.fn().mockResolvedValue([
    { id: 'choice-1', question_id: 'question-1', label: '4週', choice_order: 1 },
  ]),
  getSurveyQuestions: vi.fn().mockResolvedValue([
    { id: 'question-1', survey_id: 'survey-1', title: '期間を選んでください', question_order: 1 },
  ]),
  jstNow: vi.fn().mockReturnValue('2026-05-14T10:00:00+09:00'),
  startFriendSurvey: mocks.startFriendSurvey,
}));

vi.mock('../services/step-delivery.js', () => ({
  buildMessage: vi.fn((type: string, content: string) => {
    if (type === 'text') return { type: 'text', text: content };
    return { type: 'flex', altText: 'flex', contents: JSON.parse(content) };
  }),
}));

function createStmt(firstValue: unknown = null) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstValue),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
}

function createDb() {
  const statements: Array<{ sql: string; stmt: ReturnType<typeof createStmt> }> = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      let firstValue: unknown = null;
      if (sql.includes('FROM friends') && sql.includes('line_account_id')) {
        firstValue = {
          id: 'friend-1',
          line_user_id: 'U001',
          display_name: 'Test User',
          line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
        };
      }
      if (sql.includes('FROM surveys')) {
        firstValue = { id: 'survey-1', name: 'バリリンガル見積診断' };
      }
      if (sql.includes('FROM tags')) {
        firstValue = { id: 'tag-chat' };
      }
      const stmt = createStmt(firstValue);
      statements.push({ sql, stmt });
      return stmt;
    }),
  } as unknown as D1Database & { prepare: ReturnType<typeof vi.fn> };

  return { db, statements };
}

function createLineClient() {
  return {
    replyMessage: vi.fn().mockResolvedValue(undefined),
    pushMessage: vi.fn().mockResolvedValue(undefined),
  };
}

async function runAction(action: string) {
  const { db, statements } = createDb();
  const lineClient = createLineClient();

  const result = await handleBalilingualEstimatePostback({
    db,
    lineClient: lineClient as never,
    replyToken: 'reply-token',
    userId: 'U001',
    lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    postbackData: `action=${action}&friend_id=friend-1`,
  });

  return { result, db, statements, lineClient };
}

describe('balilingual postback handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses URLSearchParams estimate postback data', () => {
    expect(parseBalilingualEstimatePostback('action=book_consultation&friend_id=friend-1')).toEqual({
      action: 'book_consultation',
      friendId: 'friend-1',
    });
  });

  it('handles book_consultation by sending calendar slots flex', async () => {
    const { result, lineClient, statements } = await runAction('book_consultation');

    expect(result).toEqual({ handled: true, action: 'book_consultation' });
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      expect.arrayContaining([expect.objectContaining({ type: 'flex' })]),
    );
    expect(statements[0].sql).toContain('line_account_id = ?');
    expect(statements[0].stmt.bind).toHaveBeenCalledWith('friend-1', 'U001', BALILINGUAL_LINE_ACCOUNT_ID);
  });

  it('handles re_estimate by restarting the scoped estimate survey', async () => {
    const { result, lineClient, statements } = await runAction('re_estimate');

    expect(result).toEqual({ handled: true, action: 're_estimate' });
    expect(mocks.startFriendSurvey).toHaveBeenCalledWith(expect.anything(), 'friend-1', 'survey-1');
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: expect.stringContaining('再見積もり') }),
        expect.objectContaining({ type: 'flex' }),
      ]),
    );
    expect(statements.some((entry) => entry.sql.includes('surveys WHERE line_account_id = ?'))).toBe(true);
  });

  it('handles ask_question by adding the chat consultation tag and prompting for text', async () => {
    const { result, lineClient, statements } = await runAction('ask_question');

    expect(result).toEqual({ handled: true, action: 'ask_question' });
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      [expect.objectContaining({ type: 'text', text: expect.stringContaining('ご質問内容') })],
    );
    expect(statements.some((entry) => entry.sql.includes('INSERT OR IGNORE INTO friend_tags'))).toBe(true);
  });

  it('handles request_mail_brochure by asking for an email address', async () => {
    const { result, lineClient } = await runAction('request_mail_brochure');

    expect(result).toEqual({ handled: true, action: 'request_mail_brochure' });
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      [expect.objectContaining({ type: 'text', text: expect.stringContaining('メールアドレス') })],
    );
  });

  it('does not handle other line accounts', async () => {
    const { db } = createDb();
    const lineClient = createLineClient();

    const result = await handleBalilingualEstimatePostback({
      db,
      lineClient: lineClient as never,
      replyToken: 'reply-token',
      userId: 'U001',
      lineAccountId: '3e005b38-0adf-492f-9648-ee09d7c78424',
      postbackData: 'action=ask_question&friend_id=friend-1',
    });

    expect(result).toEqual({ handled: false });
    expect(lineClient.replyMessage).not.toHaveBeenCalled();
  });
});
