import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { broadcasts } from '../routes/broadcasts.js';

const mocks = vi.hoisted(() => ({
  getBroadcastById: vi.fn(),
  processBroadcastSend: vi.fn(),
  processSegmentSend: vi.fn(),
  lineClient: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getBroadcasts: vi.fn(),
  getBroadcastById: mocks.getBroadcastById,
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  deleteBroadcast: vi.fn(),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: mocks.lineClient,
}));

vi.mock('../services/broadcast.js', () => ({
  processBroadcastSend: mocks.processBroadcastSend,
}));

vi.mock('../services/segment-send.js', () => ({
  processSegmentSend: mocks.processSegmentSend,
}));

type AccountRow = { line_account_id: string | null };

function createBroadcast() {
  return {
    id: 'broadcast-1',
    title: 'Test broadcast',
    message_type: 'text',
    message_content: 'hello',
    target_type: 'tag',
    target_tag_id: 'tag-1',
    status: 'draft',
    scheduled_at: null,
    sent_at: null,
    total_count: 0,
    success_count: 0,
    created_at: '2026-05-15T00:00:00.000Z',
  };
}

function createDb(accountRows: AccountRow[]) {
  const statement = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: accountRows }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true }),
  };

  return {
    db: {
      prepare: vi.fn(() => statement),
      batch: vi.fn(),
      exec: vi.fn(),
      dump: vi.fn(),
    } as unknown as D1Database,
    statement,
  };
}

function createApp() {
  const app = new Hono();
  app.route('/', broadcasts);
  return app;
}

function makeEnv(db: D1Database) {
  return {
    DB: db,
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
    WORKER_URL: 'https://worker.test',
  };
}

async function requestSend(app: Hono, db: D1Database, body?: unknown) {
  return app.request(
    '/api/broadcasts/broadcast-1/send',
    body === undefined
      ? { method: 'POST' }
      : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
    makeEnv(db),
  );
}

async function requestSegment(app: Hono, db: D1Database, body?: Record<string, unknown>) {
  return app.request(
    '/api/broadcasts/broadcast-1/send-to-segment',
    {
      method: 'POST',
      body: JSON.stringify({
        conditions: {
          operator: 'AND',
          rules: [{ type: 'is_following', value: true }],
        },
        ...body,
      }),
      headers: { 'content-type': 'application/json' },
    },
    makeEnv(db),
  );
}

describe('broadcast cross-tenant target confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const broadcast = createBroadcast();
    mocks.getBroadcastById.mockResolvedValue(broadcast);
    mocks.processBroadcastSend.mockResolvedValue({ ...broadcast, status: 'sent' });
    mocks.processSegmentSend.mockResolvedValue({ ...broadcast, status: 'sent' });
  });

  describe.each([
    ['send', requestSend, () => mocks.processBroadcastSend],
    ['send-to-segment', requestSegment, () => mocks.processSegmentSend],
  ] as const)('%s', (_name, sendRequest, getProcessMock) => {
    it('allows a single target account without confirmCrossTenant', async () => {
      const { db } = createDb([{ line_account_id: '@409ankpf' }]);
      const res = await sendRequest(createApp(), db);

      expect(res.status).toBe(200);
      expect(getProcessMock()).toHaveBeenCalledTimes(1);
    });

    it('allows all-null target accounts without confirmCrossTenant', async () => {
      const { db } = createDb([{ line_account_id: null }]);
      const res = await sendRequest(createApp(), db);

      expect(res.status).toBe(200);
      expect(getProcessMock()).toHaveBeenCalledTimes(1);
    });

    it('rejects mixed target accounts without confirmCrossTenant', async () => {
      const { db } = createDb([
        { line_account_id: '@409ankpf' },
        { line_account_id: '@391irgle' },
      ]);
      const res = await sendRequest(createApp(), db);
      const json = await res.json() as { error: string };

      expect(res.status).toBe(409);
      expect(json.error).toBe('cross-tenant broadcast requires confirmCrossTenant=true');
      expect(getProcessMock()).not.toHaveBeenCalled();
    });

    it('allows mixed target accounts with confirmCrossTenant=true', async () => {
      const { db } = createDb([
        { line_account_id: '@409ankpf' },
        { line_account_id: '@391irgle' },
      ]);
      const res = await sendRequest(createApp(), db, { confirmCrossTenant: true });

      expect(res.status).toBe(200);
      expect(getProcessMock()).toHaveBeenCalledTimes(1);
    });
  });
});
