import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const state = vi.hoisted(() => ({
  automations: [] as any[],
  nextId: 1,
}));

vi.mock('@line-crm/db', () => ({
  getAutomations: vi.fn().mockResolvedValue([]),
  getAutomationById: vi.fn().mockImplementation((_db: unknown, id: string) => {
    return Promise.resolve(state.automations.find((item) => item.id === id) ?? null);
  }),
  createAutomation: vi.fn().mockImplementation((_db: unknown, input: any) => {
    const item = {
      id: `auto-${state.nextId++}`,
      name: input.name,
      description: input.description ?? null,
      event_type: input.eventType,
      conditions: JSON.stringify(input.conditions ?? {}),
      actions: JSON.stringify(input.actions),
      line_account_id: null,
      is_active: 1,
      priority: input.priority ?? 0,
      created_at: '2026-05-15T00:00:00',
      updated_at: '2026-05-15T00:00:00',
    };
    state.automations.push(item);
    return Promise.resolve(item);
  }),
  updateAutomation: vi.fn().mockImplementation((_db: unknown, id: string, updates: any) => {
    const item = state.automations.find((candidate) => candidate.id === id);
    if (item && updates.name !== undefined) item.name = updates.name;
    return Promise.resolve();
  }),
  deleteAutomation: vi.fn().mockResolvedValue(undefined),
  getAutomationLogs: vi.fn().mockResolvedValue([]),
}));

import { automations } from '../routes/automations.js';

function createDb(ownerById: Record<string, string | null> = {}): D1Database {
  const stmt = {
    bound: [] as unknown[],
    bind: vi.fn(function (this: typeof stmt, ...args: unknown[]) {
      this.bound = args;
      return this;
    }),
    first: vi.fn(function (this: typeof stmt) {
      const id = String(this.bound[0] ?? '');
      if (id in ownerById) return Promise.resolve({ line_account_id: ownerById[id] });
      return Promise.resolve(null);
    }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn(function (this: typeof stmt) {
      const [lineAccountId, id] = this.bound;
      const item = state.automations.find((candidate) => candidate.id === id);
      if (item) item.line_account_id = lineAccountId;
      return Promise.resolve({ success: true });
    }),
    raw: vi.fn().mockResolvedValue([]),
  };
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as D1Database;
}

function createApp() {
  const app = new Hono();
  app.route('/', automations);
  return app;
}

function env(db: D1Database) {
  return { DB: db };
}

describe('tenant guard: automations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.automations.length = 0;
    state.nextId = 1;
  });

  it('POST /api/automations accepts valid lineAccountId', async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Welcome',
          eventType: 'friend_add',
          actions: [{ type: 'reply', content: 'hi' }],
          lineAccountId: 'acc-1',
        }),
      }),
      undefined,
      env(createDb()),
    );

    expect(res.status).toBe(201);
    expect(state.automations[0].line_account_id).toBe('acc-1');
  });

  it("POST /api/automations returns 400 when lineAccountId is missing", async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Welcome',
          eventType: 'friend_add',
          actions: [{ type: 'reply', content: 'hi' }],
        }),
      }),
      undefined,
      env(createDb()),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'lineAccountId is required' });
  });

  it('PUT /api/automations/:id accepts matching owner', async () => {
    state.automations.push({
      id: 'auto-1',
      name: 'Before',
      description: null,
      event_type: 'friend_add',
      conditions: '{}',
      actions: '[]',
      line_account_id: 'acc-1',
      is_active: 1,
      priority: 0,
      created_at: '2026-05-15',
      updated_at: '2026-05-15',
    });

    const res = await createApp().request(
      new Request('http://localhost/api/automations/auto-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After', lineAccountId: 'acc-1' }),
      }),
      undefined,
      env(createDb({ 'auto-1': 'acc-1' })),
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ success: true, data: { name: 'After' } });
  });

  it("PUT /api/automations/:id returns 400 when lineAccountId is missing", async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/automations/auto-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After' }),
      }),
      undefined,
      env(createDb({ 'auto-1': 'acc-1' })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'lineAccountId is required' });
  });

  it('PUT /api/automations/:id returns 403 when owner mismatches', async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/automations/auto-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After', lineAccountId: 'acc-2' }),
      }),
      undefined,
      env(createDb({ 'auto-1': 'acc-1' })),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, error: 'tenant mismatch' });
  });
});
