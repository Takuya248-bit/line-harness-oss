import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  handleBalilingualEstimatePostback,
  isDryRunBooking,
} from '../services/balilingual-postback-handler.js';

const mocks = vi.hoisted(() => ({
  createBooking: vi.fn().mockResolvedValue({ id: 'booking-1' }),
  createCalendarEvent: vi.fn().mockResolvedValue({ id: 'gcal-1' }),
  getAccessToken: vi.fn().mockResolvedValue('access-token'),
  recordActions: vi.fn().mockResolvedValue(undefined),
  updateBookingGoogleEventId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/db', () => ({
  createBooking: mocks.createBooking,
  getSurveyChoices: vi.fn().mockResolvedValue([]),
  getSurveyQuestions: vi.fn().mockResolvedValue([]),
  jstNow: vi.fn().mockReturnValue('2026-05-14T10:00:00+09:00'),
  recordActions: mocks.recordActions,
  startFriendSurvey: vi.fn().mockResolvedValue({ id: 'friend-survey-1' }),
  updateBookingGoogleEventId: mocks.updateBookingGoogleEventId,
}));

vi.mock('../services/google-calendar-sa.js', () => ({
  createCalendarEvent: mocks.createCalendarEvent,
  getAccessToken: mocks.getAccessToken,
}));

vi.mock('../services/step-delivery.js', () => ({
  buildMessage: vi.fn((type: string, content: string) => {
    if (type === 'text') return { type: 'text', text: content };
    return { type: 'flex', altText: 'flex', contents: JSON.parse(content) };
  }),
}));

function createDb() {
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM friends') && sql.includes('line_user_id') && sql.includes('line_account_id')) {
            expect(args).toEqual(['U001', BALILINGUAL_LINE_ACCOUNT_ID]);
            return {
              id: 'friend-1',
              line_user_id: 'U001',
              display_name: 'Takuya',
              line_account_id: BALILINGUAL_LINE_ACCOUNT_ID,
            };
          }
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    })),
  } as unknown as D1Database;

  return db;
}

function createLineClient() {
  return {
    replyMessage: vi.fn().mockResolvedValue(undefined),
    pushMessage: vi.fn().mockResolvedValue(undefined),
  };
}

async function runConfirmBooking(env: { BALILINGUAL_DRY_RUN_BOOKING?: string } = {}) {
  const lineClient = createLineClient();
  const result = await handleBalilingualEstimatePostback({
    db: createDb(),
    lineClient: lineClient as never,
    replyToken: 'reply-token',
    userId: 'U001',
    lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    postbackData: new URLSearchParams({
      action: 'confirm_booking',
      start: '2026-05-15T01:00:00.000Z',
      end: '2026-05-15T01:30:00.000Z',
    }).toString(),
    env: {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.com',
      GOOGLE_SERVICE_ACCOUNT_KEY: 'private-key',
      GOOGLE_CALENDAR_ID: 'calendar-id',
      ...env,
    },
  });

  return { result, lineClient };
}

describe('balilingual dry-run booking postback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a pure dry-run predicate', () => {
    expect(isDryRunBooking({ BALILINGUAL_DRY_RUN_BOOKING: 'true' })).toBe(true);
    expect(isDryRunBooking({ BALILINGUAL_DRY_RUN_BOOKING: 'false' })).toBe(false);
    expect(isDryRunBooking(undefined)).toBe(false);
  });

  it('skips Google Calendar and inserts is_test_booking=1 when DRY_RUN=true', async () => {
    const { result, lineClient } = await runConfirmBooking({ BALILINGUAL_DRY_RUN_BOOKING: 'true' });

    expect(result).toEqual({ handled: true, action: 'confirm_booking' });
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(mocks.createCalendarEvent).not.toHaveBeenCalled();
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
        startTime: '2026-05-15T01:00:00.000Z',
        endTime: '2026-05-15T01:30:00.000Z',
        isTestBooking: true,
      }),
    );
    expect(lineClient.replyMessage).toHaveBeenCalledWith(
      'reply-token',
      [expect.objectContaining({ type: 'flex' })],
    );
  });

  it('creates Google Calendar and inserts is_test_booking=0 when DRY_RUN=false', async () => {
    await runConfirmBooking({ BALILINGUAL_DRY_RUN_BOOKING: 'false' });

    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.createCalendarEvent).toHaveBeenCalledWith(
      'access-token',
      'calendar-id',
      expect.objectContaining({
        start: '2026-05-15T01:00:00.000Z',
        end: '2026-05-15T01:30:00.000Z',
      }),
    );
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ googleEventId: 'gcal-1', isTestBooking: false }),
    );
  });

  it('creates Google Calendar and inserts is_test_booking=0 when DRY_RUN is undefined', async () => {
    await runConfirmBooking();

    expect(mocks.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ googleEventId: 'gcal-1', isTestBooking: false }),
    );
  });
});
