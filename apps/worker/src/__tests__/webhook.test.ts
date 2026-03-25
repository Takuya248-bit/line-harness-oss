import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { WebhookRequestBody } from '@line-crm/line-sdk';

// --- Mocks ---

// Mock @line-crm/line-sdk
vi.mock('@line-crm/line-sdk', () => {
  return {
    verifySignature: vi.fn(),
    LineClient: vi.fn().mockImplementation(() => ({
      getProfile: vi.fn().mockResolvedValue({ displayName: 'Test User', userId: 'U001', pictureUrl: null, statusMessage: null }),
      replyMessage: vi.fn().mockResolvedValue(undefined),
      pushMessage: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock @line-crm/db
vi.mock('@line-crm/db', () => ({
  upsertFriend: vi.fn().mockResolvedValue({ id: 'friend-1', display_name: 'Test User', user_id: null }),
  updateFriendFollowStatus: vi.fn().mockResolvedValue(undefined),
  getFriendByLineUserId: vi.fn().mockResolvedValue({ id: 'friend-1', display_name: 'Test User', user_id: null }),
  getScenarios: vi.fn().mockResolvedValue([]),
  enrollFriendInScenario: vi.fn(),
  getScenarioSteps: vi.fn().mockResolvedValue([]),
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  upsertChatOnMessage: vi.fn().mockResolvedValue(undefined),
  getLineAccounts: vi.fn().mockResolvedValue([]),
  jstNow: vi.fn().mockReturnValue('2026-03-25T12:00:00+09:00'),
}));

// Mock services
vi.mock('../services/event-bus.js', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/step-delivery.js', () => ({
  buildMessage: vi.fn().mockImplementation((type: string, content: string) => {
    if (type === 'text') return { type: 'text', text: content };
    return { type: 'text', text: content };
  }),
  expandVariables: vi.fn().mockImplementation((content: string) => content),
}));

import { verifySignature } from '@line-crm/line-sdk';
import { getFriendByLineUserId, getLineAccounts, upsertFriend, updateFriendFollowStatus, upsertChatOnMessage } from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { webhook } from '../routes/webhook.js';

const mockedVerifySignature = vi.mocked(verifySignature);

// --- Helpers ---

function createMockD1(): D1Database {
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
    raw: vi.fn().mockResolvedValue([]),
  };
  return {
    prepare: vi.fn().mockReturnValue(mockStmt),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

function createApp() {
  const app = new Hono<{
    Bindings: {
      DB: D1Database;
      LINE_CHANNEL_SECRET: string;
      LINE_CHANNEL_ACCESS_TOKEN: string;
      API_KEY: string;
      LIFF_URL: string;
      LINE_CHANNEL_ID: string;
      LINE_LOGIN_CHANNEL_ID: string;
      LINE_LOGIN_CHANNEL_SECRET: string;
      WORKER_URL: string;
    };
  }>();
  app.route('/', webhook);
  return app;
}

function makeEnv(db?: D1Database) {
  return {
    DB: db ?? createMockD1(),
    LINE_CHANNEL_SECRET: 'test-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
    API_KEY: 'test-api-key',
    LIFF_URL: 'https://liff.line.me/test',
    LINE_CHANNEL_ID: 'test-channel-id',
    LINE_LOGIN_CHANNEL_ID: 'test-login-channel',
    LINE_LOGIN_CHANNEL_SECRET: 'test-login-secret',
    WORKER_URL: 'https://worker.example.com',
  };
}

function makeExecutionCtx(waitUntilFn?: ReturnType<typeof vi.fn>) {
  return {
    waitUntil: waitUntilFn ?? vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function makeWebhookRequest(body: WebhookRequestBody, signature = 'valid-sig') {
  return new Request('http://localhost/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Line-Signature': signature,
    },
    body: JSON.stringify(body),
  });
}

function makeTextMessageBody(text: string, userId = 'U001'): WebhookRequestBody {
  return {
    destination: 'Udest001',
    events: [
      {
        type: 'message',
        replyToken: 'reply-token-001',
        message: { type: 'text', id: 'msg-001', text },
        source: { type: 'user', userId },
        timestamp: Date.now(),
        webhookEventId: 'evt-001',
        deliveryContext: { isRedelivery: false },
        mode: 'active',
      },
    ],
  };
}

// --- Tests ---

describe('webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signature verification', () => {
    it('returns 200 with invalid signature (LINE best practice: always 200)', async () => {
      mockedVerifySignature.mockResolvedValue(false);

      const app = createApp();
      const env = makeEnv();
      const body: WebhookRequestBody = { destination: 'Udest', events: [] };
      const req = makeWebhookRequest(body, 'bad-signature');

      const res = await app.request(req, undefined, env, makeExecutionCtx());
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: 'ok' });
    });

    it('processes events when signature is valid', async () => {
      mockedVerifySignature.mockResolvedValue(true);

      const app = createApp();
      const env = makeEnv();
      const body: WebhookRequestBody = { destination: 'Udest', events: [] };
      const req = makeWebhookRequest(body);

      const res = await app.request(req, undefined, env, makeExecutionCtx());
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: 'ok' });
    });
  });

  describe('invalid request body', () => {
    it('returns 200 even when body is not valid JSON', async () => {
      const app = createApp();
      const env = makeEnv();
      const req = new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'some-sig',
        },
        body: 'not-json!!!',
      });

      const res = await app.request(req, undefined, env, makeExecutionCtx());
      expect(res.status).toBe(200);
    });
  });

  describe('text message auto-reply', () => {
    it('triggers auto-reply from auto_replies table on exact match', async () => {
      mockedVerifySignature.mockResolvedValue(true);

      const db = createMockD1();
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn(),
        run: vi.fn().mockResolvedValue({ success: true }),
        raw: vi.fn().mockResolvedValue([]),
      };
      // Intercept DB calls for auto_replies and automations
      let callCount = 0;
      (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
        if (sql.includes('auto_replies')) {
          return {
            ...mockStmt,
            all: vi.fn().mockResolvedValue({
              results: [
                {
                  id: 'ar-1',
                  keyword: 'hello',
                  match_type: 'exact',
                  response_type: 'text',
                  response_content: 'Hi there!',
                  is_active: 1,
                  created_at: '2026-01-01',
                },
              ],
            }),
          };
        }
        if (sql.includes('automations')) {
          return {
            ...mockStmt,
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        }
        if (sql.includes('messages_log')) {
          return mockStmt;
        }
        return mockStmt;
      });

      const app = createApp();
      const env = makeEnv(db);
      const body = makeTextMessageBody('hello');
      const req = makeWebhookRequest(body);

      const waitUntilFn = vi.fn().mockImplementation(async (p: Promise<unknown>) => {
        await p;
      });
      const res = await app.request(req, undefined, env, makeExecutionCtx(waitUntilFn));

      expect(res.status).toBe(200);
      // waitUntil should be called (async processing)
      expect(waitUntilFn).toHaveBeenCalled();

      // Wait for async processing to complete
      if (waitUntilFn.mock.calls.length > 0) {
        await waitUntilFn.mock.calls[0][0];
      }

      // fireEvent should be called for message_received
      expect(vi.mocked(fireEvent)).toHaveBeenCalledWith(
        expect.anything(), // db
        'message_received',
        expect.objectContaining({
          friendId: 'friend-1',
          eventData: expect.objectContaining({ matched: true, text: 'hello' }),
        }),
        'test-token',
        null,
      );
    });

    it('triggers auto-reply from automations table on keyword match', async () => {
      mockedVerifySignature.mockResolvedValue(true);

      const db = createMockD1();
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
        raw: vi.fn().mockResolvedValue([]),
      };
      (db.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
        if (sql.includes('auto_replies')) {
          return {
            ...mockStmt,
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        }
        if (sql.includes('automations')) {
          return {
            ...mockStmt,
            all: vi.fn().mockResolvedValue({
              results: [
                {
                  id: 'auto-1',
                  name: 'Keyword reply',
                  conditions: JSON.stringify({ keyword: 'help', matchType: 'contains' }),
                  actions: JSON.stringify([{ type: 'reply', messageType: 'text', content: 'How can I help?' }]),
                  is_active: 1,
                  priority: 10,
                  created_at: '2026-01-01',
                },
              ],
            }),
          };
        }
        if (sql.includes('messages_log')) {
          return mockStmt;
        }
        return mockStmt;
      });

      const app = createApp();
      const env = makeEnv(db);
      const body = makeTextMessageBody('I need help please');
      const req = makeWebhookRequest(body);

      const waitUntilFn = vi.fn().mockImplementation(async (p: Promise<unknown>) => {
        await p;
      });
      const res = await app.request(req, undefined, env, makeExecutionCtx(waitUntilFn));

      expect(res.status).toBe(200);
      expect(waitUntilFn).toHaveBeenCalled();

      if (waitUntilFn.mock.calls.length > 0) {
        await waitUntilFn.mock.calls[0][0];
      }

      expect(vi.mocked(fireEvent)).toHaveBeenCalledWith(
        expect.anything(), // db
        'message_received',
        expect.objectContaining({
          friendId: 'friend-1',
          eventData: expect.objectContaining({ matched: true, text: 'I need help please' }),
        }),
        'test-token',
        null,
      );
    });
  });

  describe('follow / unfollow events', () => {
    it('calls upsertFriend on follow event', async () => {
      mockedVerifySignature.mockResolvedValue(true);

      const app = createApp();
      const env = makeEnv();
      const body: WebhookRequestBody = {
        destination: 'Udest',
        events: [
          {
            type: 'follow',
            replyToken: 'rt-follow',
            source: { type: 'user', userId: 'U-new' },
            timestamp: Date.now(),
            webhookEventId: 'evt-follow',
            deliveryContext: { isRedelivery: false },
            mode: 'active',
          },
        ],
      };
      const req = makeWebhookRequest(body);

      const waitUntilFn = vi.fn().mockImplementation(async (p: Promise<unknown>) => {
        await p;
      });
      const res = await app.request(req, undefined, env, makeExecutionCtx(waitUntilFn));

      expect(res.status).toBe(200);

      if (waitUntilFn.mock.calls.length > 0) {
        await waitUntilFn.mock.calls[0][0];
      }

      expect(vi.mocked(upsertFriend)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lineUserId: 'U-new' }),
      );
    });

    it('calls updateFriendFollowStatus on unfollow event', async () => {
      mockedVerifySignature.mockResolvedValue(true);

      const app = createApp();
      const env = makeEnv();
      const body: WebhookRequestBody = {
        destination: 'Udest',
        events: [
          {
            type: 'unfollow',
            source: { type: 'user', userId: 'U-gone' },
            timestamp: Date.now(),
            webhookEventId: 'evt-unfollow',
            deliveryContext: { isRedelivery: false },
            mode: 'active',
          },
        ],
      };
      const req = makeWebhookRequest(body);

      const waitUntilFn = vi.fn().mockImplementation(async (p: Promise<unknown>) => {
        await p;
      });
      const res = await app.request(req, undefined, env, makeExecutionCtx(waitUntilFn));

      expect(res.status).toBe(200);

      if (waitUntilFn.mock.calls.length > 0) {
        await waitUntilFn.mock.calls[0][0];
      }

      expect(vi.mocked(updateFriendFollowStatus)).toHaveBeenCalledWith(
        expect.anything(),
        'U-gone',
        false,
      );
    });
  });

  describe('multi-account support', () => {
    it('resolves credentials from DB when destination is present', async () => {
      // First call (account matching) returns false, second (env fallback) returns true
      mockedVerifySignature
        .mockResolvedValueOnce(false) // No matching DB account
        .mockResolvedValueOnce(true); // Env secret matches

      vi.mocked(getLineAccounts).mockResolvedValue([
        {
          id: 'acct-1',
          name: 'Account 1',
          channel_id: 'ch-1',
          channel_secret: 'other-secret',
          channel_access_token: 'other-token',
          is_active: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          login_channel_id: null,
          login_channel_secret: null,
          token_expires_at: null,
          refresh_token: null,
          webhook_active: 1,
        } as any,
      ]);

      const app = createApp();
      const env = makeEnv();
      const body: WebhookRequestBody = { destination: 'Udest', events: [] };
      const req = makeWebhookRequest(body);

      const res = await app.request(req, undefined, env, makeExecutionCtx());
      expect(res.status).toBe(200);
      expect(vi.mocked(getLineAccounts)).toHaveBeenCalled();
    });
  });
});
