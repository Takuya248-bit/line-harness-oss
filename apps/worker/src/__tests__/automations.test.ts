import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// --- Mocks ---

const mockAutomations: any[] = [];
let nextId = 1;

vi.mock('@line-crm/db', () => ({
  getAutomations: vi.fn().mockImplementation(() => Promise.resolve(mockAutomations)),
  getAutomationById: vi.fn().mockImplementation((db: unknown, id: string) => {
    return Promise.resolve(mockAutomations.find((a) => a.id === id) ?? null);
  }),
  createAutomation: vi.fn().mockImplementation((db: unknown, input: any) => {
    const item = {
      id: `auto-${nextId++}`,
      name: input.name,
      description: input.description ?? null,
      event_type: input.eventType,
      conditions: JSON.stringify(input.conditions ?? {}),
      actions: JSON.stringify(input.actions),
      line_account_id: null,
      is_active: 1,
      priority: input.priority ?? 0,
      created_at: '2026-03-25T12:00:00',
      updated_at: '2026-03-25T12:00:00',
    };
    mockAutomations.push(item);
    return Promise.resolve(item);
  }),
  updateAutomation: vi.fn().mockImplementation((db: unknown, id: string, updates: any) => {
    const item = mockAutomations.find((a) => a.id === id);
    if (item) {
      if (updates.name !== undefined) item.name = updates.name;
      if (updates.isActive !== undefined) item.is_active = updates.isActive ? 1 : 0;
      if (updates.conditions !== undefined) item.conditions = JSON.stringify(updates.conditions);
      if (updates.actions !== undefined) item.actions = JSON.stringify(updates.actions);
    }
    return Promise.resolve();
  }),
  deleteAutomation: vi.fn().mockImplementation((db: unknown, id: string) => {
    const idx = mockAutomations.findIndex((a) => a.id === id);
    if (idx >= 0) mockAutomations.splice(idx, 1);
    return Promise.resolve();
  }),
  getAutomationLogs: vi.fn().mockResolvedValue([]),
}));

import { automations } from '../routes/automations.js';
import { getAutomations, createAutomation, updateAutomation, deleteAutomation, getAutomationById } from '@line-crm/db';

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
  app.route('/', automations);
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

// --- Tests ---

describe('automations CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAutomations.length = 0;
    nextId = 1;
  });

  describe('POST /api/automations', () => {
    it('creates a new automation and returns 201', async () => {
      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Welcome message',
          eventType: 'message_received',
          conditions: { keyword: 'hello', matchType: 'exact' },
          actions: [{ type: 'reply', messageType: 'text', content: 'Welcome!' }],
          priority: 10,
        }),
      });

      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(201);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Welcome message');
      expect(json.data.eventType).toBe('message_received');
      expect(json.data.isActive).toBe(true);

      expect(vi.mocked(createAutomation)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Welcome message',
          eventType: 'message_received',
        }),
      );
    });

    it('returns 400 when required fields are missing', async () => {
      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Incomplete' }),
      });

      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(400);

      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error).toContain('required');
    });
  });

  describe('GET /api/automations', () => {
    it('returns list of automations', async () => {
      mockAutomations.push({
        id: 'auto-existing',
        name: 'Test rule',
        description: null,
        event_type: 'message_received',
        conditions: '{"keyword":"test"}',
        actions: '[{"type":"reply","content":"ok"}]',
        line_account_id: null,
        is_active: 1,
        priority: 5,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations');
      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(200);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].name).toBe('Test rule');
      expect(json.data[0].conditions).toEqual({ keyword: 'test' });
    });
  });

  describe('GET /api/automations/:id', () => {
    it('returns a single automation with logs', async () => {
      mockAutomations.push({
        id: 'auto-abc',
        name: 'Single rule',
        description: 'A test rule',
        event_type: 'friend_add',
        conditions: '{}',
        actions: '[{"type":"reply","content":"hi"}]',
        line_account_id: null,
        is_active: 1,
        priority: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations/auto-abc');
      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(200);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('auto-abc');
      expect(json.data.eventType).toBe('friend_add');
      expect(json.data.logs).toEqual([]);
    });

    it('returns 404 for non-existent automation', async () => {
      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations/non-existent');
      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(404);

      const json = await res.json() as any;
      expect(json.success).toBe(false);
    });
  });

  describe('PUT /api/automations/:id', () => {
    it('updates an existing automation', async () => {
      mockAutomations.push({
        id: 'auto-upd',
        name: 'Original name',
        description: null,
        event_type: 'message_received',
        conditions: '{}',
        actions: '[]',
        line_account_id: null,
        is_active: 1,
        priority: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations/auto-upd', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated name' }),
      });

      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(200);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Updated name');
    });

    it('returns 404 when updating non-existent automation', async () => {
      // updateAutomation succeeds but getAutomationById returns null
      vi.mocked(getAutomationById).mockResolvedValueOnce(null);

      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations/ghost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      });

      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/automations/:id', () => {
    it('deletes an automation and returns success', async () => {
      mockAutomations.push({
        id: 'auto-del',
        name: 'To delete',
        description: null,
        event_type: 'message_received',
        conditions: '{}',
        actions: '[]',
        line_account_id: null,
        is_active: 1,
        priority: 0,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });

      const app = createApp();
      const env = makeEnv();

      const req = new Request('http://localhost/api/automations/auto-del', {
        method: 'DELETE',
      });

      const res = await app.request(req, undefined, env);
      expect(res.status).toBe(200);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data).toBeNull();

      expect(vi.mocked(deleteAutomation)).toHaveBeenCalledWith(
        expect.anything(),
        'auto-del',
      );
    });
  });
});
