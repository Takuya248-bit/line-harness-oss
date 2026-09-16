import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const state = vi.hoisted(() => ({
  scenarios: [] as any[],
  steps: [] as any[],
  nextScenarioId: 1,
  nextStepId: 1,
}));

vi.mock('@line-crm/db', () => ({
  getScenarios: vi.fn().mockResolvedValue([]),
  getScenarioById: vi.fn().mockImplementation((_db: unknown, id: string) => {
    const scenario = state.scenarios.find((item) => item.id === id);
    return Promise.resolve(scenario ? { ...scenario, steps: state.steps.filter((step) => step.scenario_id === id) } : null);
  }),
  createScenario: vi.fn().mockImplementation((_db: unknown, input: any) => {
    const item = {
      id: `scenario-${state.nextScenarioId++}`,
      name: input.name,
      description: input.description ?? null,
      trigger_type: input.triggerType,
      trigger_tag_id: input.triggerTagId ?? null,
      line_account_id: null,
      is_active: 1,
      created_at: '2026-05-15T00:00:00',
      updated_at: '2026-05-15T00:00:00',
    };
    state.scenarios.push(item);
    return Promise.resolve(item);
  }),
  updateScenario: vi.fn().mockImplementation((_db: unknown, id: string, updates: any) => {
    const item = state.scenarios.find((candidate) => candidate.id === id);
    if (!item) return Promise.resolve(null);
    if (updates.name !== undefined) item.name = updates.name;
    if (updates.trigger_type !== undefined) item.trigger_type = updates.trigger_type;
    if (updates.is_active !== undefined) item.is_active = updates.is_active;
    return Promise.resolve(item);
  }),
  deleteScenario: vi.fn().mockResolvedValue(undefined),
  createScenarioStep: vi.fn().mockImplementation((_db: unknown, input: any) => {
    const item = {
      id: `step-${state.nextStepId++}`,
      scenario_id: input.scenarioId,
      step_order: input.stepOrder,
      delay_minutes: input.delayMinutes ?? 0,
      delivery_hour: input.deliveryHour ?? null,
      message_type: input.messageType,
      message_content: input.messageContent,
      extra_messages: input.extraMessages ?? null,
      rich_menu_id: input.richMenuId ?? null,
      condition_type: input.conditionType ?? null,
      condition_value: input.conditionValue ?? null,
      next_step_on_false: input.nextStepOnFalse ?? null,
      created_at: '2026-05-15T00:00:00',
    };
    state.steps.push(item);
    return Promise.resolve(item);
  }),
  updateScenarioStep: vi.fn().mockResolvedValue(null),
  deleteScenarioStep: vi.fn().mockResolvedValue(undefined),
  enrollFriendInScenario: vi.fn(),
  getFriendById: vi.fn(),
}));

import { scenarios } from '../routes/scenarios.js';

function createDb(ownerById: Record<string, string | null> = {}): D1Database {
  const stmt = {
    bound: [] as unknown[],
    bind: vi.fn(function (this: any, ...args: unknown[]) {
      this.bound = args;
      return this;
    }),
    first: vi.fn(function (this: any) {
      const id = String(this.bound[0] ?? '');
      if (id in ownerById) return Promise.resolve({ line_account_id: ownerById[id] });
      return Promise.resolve(null);
    }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn(function (this: any) {
      const [lineAccountId, id] = this.bound;
      const scenario = state.scenarios.find((candidate) => candidate.id === id);
      if (scenario) scenario.line_account_id = lineAccountId;
      return Promise.resolve({ success: true });
    }),
    raw: vi.fn().mockResolvedValue([]),
  };
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as D1Database;
}

function createApp() {
  const app = new Hono();
  app.route('/', scenarios);
  return app;
}

function env(db: D1Database) {
  return { DB: db };
}

function seedScenario() {
  state.scenarios.push({
    id: 'scenario-1',
    name: 'Before',
    description: null,
    trigger_type: 'manual',
    trigger_tag_id: null,
    line_account_id: 'acc-1',
    is_active: 1,
    created_at: '2026-05-15',
    updated_at: '2026-05-15',
  });
}

describe('tenant guard: scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.scenarios.length = 0;
    state.steps.length = 0;
    state.nextScenarioId = 1;
    state.nextStepId = 1;
  });

  it('POST /api/scenarios accepts valid lineAccountId', async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Welcome', triggerType: 'manual', lineAccountId: 'acc-1' }),
      }),
      undefined,
      env(createDb()),
    );

    expect(res.status).toBe(201);
    expect(state.scenarios[0].line_account_id).toBe('acc-1');
  });

  it('POST /api/scenarios returns 400 when lineAccountId is missing', async () => {
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Welcome', triggerType: 'manual' }),
      }),
      undefined,
      env(createDb()),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'lineAccountId is required' });
  });

  it('PUT /api/scenarios/:id accepts matching owner', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After', lineAccountId: 'acc-1' }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ success: true, data: { name: 'After' } });
  });

  it('PUT /api/scenarios/:id returns 400 when lineAccountId is missing', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After' }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'lineAccountId is required' });
  });

  it('PUT /api/scenarios/:id returns 403 when owner mismatches', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'After', lineAccountId: 'acc-2' }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, error: 'tenant mismatch' });
  });

  it('POST /api/scenarios/:id/steps accepts matching parent owner', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepOrder: 1,
          messageType: 'text',
          messageContent: 'hello',
          lineAccountId: 'acc-1',
        }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(201);
    expect((await res.json()) as any).toMatchObject({ success: true, data: { scenarioId: 'scenario-1' } });
  });

  it('POST /api/scenarios/:id/steps returns 400 when lineAccountId is missing', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepOrder: 1, messageType: 'text', messageContent: 'hello' }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'lineAccountId is required' });
  });

  it('POST /api/scenarios/:id/steps returns 403 when parent owner mismatches', async () => {
    seedScenario();
    const res = await createApp().request(
      new Request('http://localhost/api/scenarios/scenario-1/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepOrder: 1,
          messageType: 'text',
          messageContent: 'hello',
          lineAccountId: 'acc-2',
        }),
      }),
      undefined,
      env(createDb({ 'scenario-1': 'acc-1' })),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, error: 'tenant mismatch' });
  });
});
