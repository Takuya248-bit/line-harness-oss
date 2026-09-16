import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { balilingualAnalytics } from '../routes/balilingual-analytics.js';

const ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
const OTHER_ACCOUNT_ID = '3e005b38-other-account';

type MockStatement = {
  sql: string;
  binds: unknown[];
  bind: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

function statement(sql: string, results: Record<string, unknown>[] = []): MockStatement {
  const stmt: Partial<MockStatement> = { sql, binds: [] };
  stmt.bind = vi.fn((...args: unknown[]) => {
    stmt.binds = args;
    return stmt;
  });
  stmt.all = vi.fn().mockResolvedValue({ results });
  stmt.first = vi.fn().mockResolvedValue(null);
  stmt.run = vi.fn().mockResolvedValue({ success: true });
  return stmt as MockStatement;
}

function createMockD1(resultForSql: (sql: string) => Record<string, unknown>[]) {
  const statements: MockStatement[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = statement(sql, resultForSql(sql));
      statements.push(stmt);
      return stmt;
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;

  return { db, statements };
}

function createApp() {
  const app = new Hono<{ Bindings: { DB: D1Database; API_KEY: string } }>();
  app.use('*', authMiddleware as never);
  app.route('/', balilingualAnalytics);
  return app;
}

function env(db: D1Database) {
  return { DB: db, API_KEY: 'test-key' };
}

function authed(path: string) {
  return new Request(`https://worker.test${path}`, { headers: { Authorization: 'Bearer test-key' } });
}

describe('balilingual analytics', () => {
  it('requires API_KEY auth', async () => {
    const { db } = createMockD1(() => []);
    const res = await createApp().request(new Request('https://worker.test/api/balilingual/funnel-detailed'), undefined, env(db));
    expect(res.status).toBe(401);
  });

  it('returns detailed funnel counts and week-over-week transition data for the fixed account only', async () => {
    let phaseQuery = 0;
    const { db, statements } = createMockD1((sql) => {
      if (!sql.includes('FROM friend_tags')) return [];
      phaseQuery += 1;
      if (phaseQuery === 1) return [{ phase: 'アンケート_回答済', count: 10 }, { phase: 'アンケート_相談希望', count: 5 }];
      if (phaseQuery === 2) return [{ phase: 'アンケート_回答済', count: 4 }, { phase: 'アンケート_相談希望', count: 2 }];
      if (phaseQuery === 3) return [{ phase: 'アンケート_回答済', count: 8 }, { phase: 'アンケート_相談希望', count: 4 }];
      return [{ phase: 'アンケート_回答済', count: 8 }, { phase: 'アンケート_相談希望', count: 4 }];
    });

    const res = await createApp().request(authed(`/api/balilingual/funnel-detailed?lineAccountId=${OTHER_ACCOUNT_ID}`), undefined, env(db));
    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(json.data.lineAccountId).toBe(ACCOUNT_ID);
    expect(json.data.phases[0]).toMatchObject({
      phase: 'アンケート_回答済',
      count: 10,
      entriesLast7Days: 4,
      entriesLast30Days: 8,
      weekOverWeekChangeRate: -50,
    });
    expect(json.data.transitions.last7Days[0]).toMatchObject({ fromCount: 4, toCount: 2, rate: 50 });
    expect(statements.every((stmt) => stmt.binds.includes(ACCOUNT_ID))).toBe(true);
    expect(statements.some((stmt) => stmt.binds.includes(OTHER_ACCOUNT_ID))).toBe(false);
  });

  it('returns zero funnel rows when no phase tags exist', async () => {
    const { db } = createMockD1(() => []);
    const res = await createApp().request(authed('/api/balilingual/funnel-detailed'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.phases[0].count).toBe(0);
    expect(json.data.transitions.last7Days[0].rate).toBe(0);
  });

  it('returns AB phase reach and CVR by variant for the fixed account only', async () => {
    const { db, statements } = createMockD1((sql) => {
      if (sql.includes('FROM ab_assignments') && sql.includes('assigned_count')) {
        return [{ variant: 'A', assigned_count: 10 }, { variant: 'B', assigned_count: 5 }];
      }
      if (sql.includes('FROM ab_assignments') && sql.includes('t.name as phase')) {
        return [
          { variant: 'A', phase: 'アンケート_回答済', count: 8 },
          { variant: 'A', phase: '入金完了', count: 2 },
          { variant: 'B', phase: 'アンケート_回答済', count: 4 },
          { variant: 'B', phase: '入金完了', count: 1 },
        ];
      }
      return [];
    });

    const res = await createApp().request(authed('/api/balilingual/ab-results/test-1'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.testId).toBe('test-1');
    expect(json.data.variants[0]).toMatchObject({ variant: 'A', assignedCount: 10 });
    expect(json.data.variants[0].phases.find((p: any) => p.phase === '入金完了')).toMatchObject({ count: 2, cvr: 20 });
    expect(statements.every((stmt) => stmt.binds.includes(ACCOUNT_ID))).toBe(true);
  });

  it('returns empty AB results for a test without assignments', async () => {
    const { db } = createMockD1(() => []);
    const res = await createApp().request(authed('/api/balilingual/ab-results/missing'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.variants).toEqual([]);
  });

  it('returns source CVR from friend add through close', async () => {
    const { db, statements } = createMockD1((sql) => {
      if (!sql.includes('FROM bali_line_registrations')) return [];
      return [
        {
          traffic_pool: 'instagram',
          friends_added: 10,
          diagnosis_completed: 7,
          consultation_booked: 4,
          meetings_completed: 3,
          closed_won: 1,
        },
      ];
    });

    const res = await createApp().request(authed('/api/balilingual/source-cvr?days=7&limit=5'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.sources[0]).toMatchObject({
      trafficPool: 'instagram',
      friendsAdded: 10,
      diagnosisCvr: 70,
      consultationCvr: 40,
      meetingCvr: 30,
      closeCvr: 10,
    });
    expect(statements[0].binds).toEqual([ACCOUNT_ID, ACCOUNT_ID, ACCOUNT_ID, 7, 5]);
  });

  it('handles source CVR zero denominators without NaN', async () => {
    const { db } = createMockD1((sql) => {
      if (!sql.includes('FROM bali_line_registrations')) return [];
      return [{ traffic_pool: null, friends_added: 0, diagnosis_completed: 0, consultation_booked: 0, meetings_completed: 0, closed_won: 0 }];
    });

    const res = await createApp().request(authed('/api/balilingual/source-cvr'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.sources[0]).toMatchObject({ trafficPool: 'unknown', diagnosisCvr: 0, closeCvr: 0 });
  });

  it('detects bottleneck phases when current week falls by at least 20 percent', async () => {
    let phaseQuery = 0;
    const { db } = createMockD1((sql) => {
      if (!sql.includes('FROM friend_tags')) return [];
      phaseQuery += 1;
      if (phaseQuery === 1) return [{ phase: '面談希望', count: 6 }, { phase: '入金完了', count: 10 }];
      return [{ phase: '面談希望', count: 10 }, { phase: '入金完了', count: 10 }];
    });

    const res = await createApp().request(authed('/api/balilingual/bottleneck'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.alerts).toEqual([
      { phase: '面談希望', currentWeekCount: 6, previousWeekCount: 10, dropRate: -40, alert: true },
    ]);
  });

  it('does not alert bottleneck for smaller drops or missing previous week', async () => {
    let phaseQuery = 0;
    const { db } = createMockD1((sql) => {
      if (!sql.includes('FROM friend_tags')) return [];
      phaseQuery += 1;
      if (phaseQuery === 1) return [{ phase: '面談希望', count: 9 }, { phase: '入金完了', count: 1 }];
      return [{ phase: '面談希望', count: 10 }];
    });

    const res = await createApp().request(authed('/api/balilingual/bottleneck'), undefined, env(db));
    const json = await res.json() as any;

    expect(json.data.alerts).toEqual([]);
  });
});
