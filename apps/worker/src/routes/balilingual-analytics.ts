import { Hono } from 'hono';
import type { Env } from '../index.js';
import { ACCOUNT_PHASE_CONFIG, BALILINGUAL_ACCOUNT_ID } from './analytics.js';

const balilingualAnalytics = new Hono<Env>();

const phaseOrder = ACCOUNT_PHASE_CONFIG[BALILINGUAL_ACCOUNT_ID]?.order ?? [];
const SOURCE_LIMIT_DEFAULT = 50;
const BOTTLENECK_DROP_THRESHOLD = -20;

type CountRow = { phase: string; count: number };
type VariantPhaseRow = { variant: string; phase: string; count: number };
type AssignmentRow = { variant: string; assigned_count: number };
type SourceCvrRow = {
  traffic_pool: string | null;
  friends_added: number;
  diagnosis_completed: number;
  consultation_booked: number;
  meetings_completed: number;
  closed_won: number;
};

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',');
}

async function phaseEntryCounts(db: D1Database, startDaysAgo: number | null, endDaysAgo: number | null): Promise<Map<string, number>> {
  const dateFilter =
    startDaysAgo === null || endDaysAgo === null
      ? ''
      : `AND ft.assigned_at >= strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours', '-' || ? || ' days')
         AND ft.assigned_at < strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours', '-' || ? || ' days')`;
  const dateBinds = startDaysAgo === null || endDaysAgo === null ? [] : [startDaysAgo, endDaysAgo];

  const rows = await db
    .prepare(
      `SELECT t.name as phase, COUNT(DISTINCT ft.friend_id) as count
       FROM friend_tags ft
       JOIN tags t ON t.id = ft.tag_id
       JOIN friends f ON f.id = ft.friend_id AND f.line_account_id = ?
       WHERE t.name IN (${placeholders(phaseOrder)})
       ${dateFilter}
       GROUP BY t.name`,
    )
    .bind(BALILINGUAL_ACCOUNT_ID, ...phaseOrder, ...dateBinds)
    .all<CountRow>();

  return new Map((rows.results ?? []).map((row) => [row.phase, row.count]));
}

function buildTransitions(counts: Map<string, number>) {
  return phaseOrder.slice(0, -1).map((from, index) => {
    const to = phaseOrder[index + 1];
    const fromCount = counts.get(from) ?? 0;
    const toCount = counts.get(to) ?? 0;
    return {
      from,
      to,
      fromCount,
      toCount,
      rate: pct(toCount, fromCount),
    };
  });
}

balilingualAnalytics.get('/api/balilingual/funnel-detailed', async (c) => {
  try {
    const db = c.env.DB;
    const [currentCounts, last7Counts, last30Counts, prev7Counts] = await Promise.all([
      phaseEntryCounts(db, null, null),
      phaseEntryCounts(db, 7, 0),
      phaseEntryCounts(db, 30, 0),
      phaseEntryCounts(db, 14, 7),
    ]);

    const phases = phaseOrder.map((phase) => ({
      phase,
      count: currentCounts.get(phase) ?? 0,
      entriesLast7Days: last7Counts.get(phase) ?? 0,
      entriesLast30Days: last30Counts.get(phase) ?? 0,
      weekOverWeekChangeRate: changePct(last7Counts.get(phase) ?? 0, prev7Counts.get(phase) ?? 0),
    }));

    return c.json({
      success: true,
      data: {
        lineAccountId: BALILINGUAL_ACCOUNT_ID,
        phases,
        transitions: {
          last7Days: buildTransitions(last7Counts),
          last30Days: buildTransitions(last30Counts),
          weekOverWeek: phaseOrder.map((phase) => ({
            phase,
            currentWeekCount: last7Counts.get(phase) ?? 0,
            previousWeekCount: prev7Counts.get(phase) ?? 0,
            changeRate: changePct(last7Counts.get(phase) ?? 0, prev7Counts.get(phase) ?? 0),
          })),
        },
      },
    });
  } catch (err) {
    console.error('GET /api/balilingual/funnel-detailed error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

balilingualAnalytics.get('/api/balilingual/ab-results/:testId', async (c) => {
  try {
    const db = c.env.DB;
    const testId = c.req.param('testId');

    const assignments = await db
      .prepare(
        `SELECT aa.variant, COUNT(DISTINCT aa.friend_id) as assigned_count
         FROM ab_assignments aa
         JOIN ab_tests ab ON ab.id = aa.ab_test_id AND ab.line_account_id = ?
         JOIN friends f ON f.id = aa.friend_id AND f.line_account_id = ?
         WHERE aa.ab_test_id = ?
         GROUP BY aa.variant
         ORDER BY aa.variant`,
      )
      .bind(BALILINGUAL_ACCOUNT_ID, BALILINGUAL_ACCOUNT_ID, testId)
      .all<AssignmentRow>();

    const phaseRows = await db
      .prepare(
        `SELECT aa.variant, t.name as phase, COUNT(DISTINCT aa.friend_id) as count
         FROM ab_assignments aa
         JOIN ab_tests ab ON ab.id = aa.ab_test_id AND ab.line_account_id = ?
         JOIN friends f ON f.id = aa.friend_id AND f.line_account_id = ?
         LEFT JOIN friend_tags ft ON ft.friend_id = aa.friend_id
         LEFT JOIN tags t ON t.id = ft.tag_id AND t.name IN (${placeholders(phaseOrder)})
         WHERE aa.ab_test_id = ?
         GROUP BY aa.variant, t.name`,
      )
      .bind(BALILINGUAL_ACCOUNT_ID, BALILINGUAL_ACCOUNT_ID, ...phaseOrder, testId)
      .all<VariantPhaseRow>();

    const phaseByVariant = new Map<string, Map<string, number>>();
    for (const row of phaseRows.results ?? []) {
      if (!row.phase) continue;
      const phaseMap = phaseByVariant.get(row.variant) ?? new Map<string, number>();
      phaseMap.set(row.phase, row.count);
      phaseByVariant.set(row.variant, phaseMap);
    }

    const variants = (assignments.results ?? []).map((row) => {
      const phaseMap = phaseByVariant.get(row.variant) ?? new Map<string, number>();
      const phases = phaseOrder.map((phase) => ({
        phase,
        count: phaseMap.get(phase) ?? 0,
        cvr: pct(phaseMap.get(phase) ?? 0, row.assigned_count),
      }));
      const finalPhase = phaseOrder[phaseOrder.length - 1];
      return {
        variant: row.variant,
        assignedCount: row.assigned_count,
        phases,
        cvr: pct(phaseMap.get(finalPhase) ?? 0, row.assigned_count),
      };
    });

    return c.json({ success: true, data: { lineAccountId: BALILINGUAL_ACCOUNT_ID, testId, variants } });
  } catch (err) {
    console.error('GET /api/balilingual/ab-results/:testId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

balilingualAnalytics.get('/api/balilingual/source-cvr', async (c) => {
  try {
    const db = c.env.DB;
    const days = Number(c.req.query('days') ?? '30');
    const limit = Number(c.req.query('limit') ?? String(SOURCE_LIMIT_DEFAULT));

    const rows = await db
      .prepare(
        `SELECT
           COALESCE(r.source, json_extract(f.metadata, '$.traffic_pool'), json_extract(f.metadata, '$.source'), f.ref_code, 'unknown') as traffic_pool,
           COUNT(DISTINCT r.friend_id) as friends_added,
           COUNT(DISTINCT CASE WHEN json_extract(f.metadata, '$.diagnosis_completed_at') IS NOT NULL OR json_extract(f.metadata, '$.scenario_status') = '診断済' THEN f.id END) as diagnosis_completed,
           COUNT(DISTINCT CASE WHEN b.id IS NOT NULL OR t_booking.name = '面談希望' OR json_extract(f.metadata, '$.consultation_intent') IS NOT NULL THEN f.id END) as consultation_booked,
           COUNT(DISTINCT CASE WHEN t_meeting.name = '面談済み' OR b.status = 'completed' THEN f.id END) as meetings_completed,
           COUNT(DISTINCT CASE WHEN t_closed.name IN ('入金完了', '留学済み') THEN f.id END) as closed_won
         FROM bali_line_registrations r
         JOIN friends f ON f.id = r.friend_id AND f.line_account_id = ?
         LEFT JOIN bookings b ON b.friend_id = f.id AND b.line_account_id = ?
         LEFT JOIN friend_tags ft_booking ON ft_booking.friend_id = f.id
         LEFT JOIN tags t_booking ON t_booking.id = ft_booking.tag_id AND t_booking.name = '面談希望'
         LEFT JOIN friend_tags ft_meeting ON ft_meeting.friend_id = f.id
         LEFT JOIN tags t_meeting ON t_meeting.id = ft_meeting.tag_id AND t_meeting.name = '面談済み'
         LEFT JOIN friend_tags ft_closed ON ft_closed.friend_id = f.id
         LEFT JOIN tags t_closed ON t_closed.id = ft_closed.tag_id AND t_closed.name IN ('入金完了', '留学済み')
         WHERE r.account_id = ?
           AND r.created_at >= strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours', '-' || ? || ' days')
         GROUP BY traffic_pool
         ORDER BY friends_added DESC
         LIMIT ?`,
      )
      .bind(BALILINGUAL_ACCOUNT_ID, BALILINGUAL_ACCOUNT_ID, BALILINGUAL_ACCOUNT_ID, days, limit)
      .all<SourceCvrRow>();

    return c.json({
      success: true,
      data: {
        lineAccountId: BALILINGUAL_ACCOUNT_ID,
        days,
        sources: (rows.results ?? []).map((row) => ({
          trafficPool: row.traffic_pool ?? 'unknown',
          friendsAdded: row.friends_added,
          diagnosisCompleted: row.diagnosis_completed,
          consultationBooked: row.consultation_booked,
          meetingsCompleted: row.meetings_completed,
          closedWon: row.closed_won,
          diagnosisCvr: pct(row.diagnosis_completed, row.friends_added),
          consultationCvr: pct(row.consultation_booked, row.friends_added),
          meetingCvr: pct(row.meetings_completed, row.friends_added),
          closeCvr: pct(row.closed_won, row.friends_added),
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/balilingual/source-cvr error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

balilingualAnalytics.get('/api/balilingual/bottleneck', async (c) => {
  try {
    const db = c.env.DB;
    const [currentWeek, previousWeek] = await Promise.all([phaseEntryCounts(db, 7, 0), phaseEntryCounts(db, 14, 7)]);
    const alerts = phaseOrder
      .map((phase) => {
        const currentWeekCount = currentWeek.get(phase) ?? 0;
        const previousWeekCount = previousWeek.get(phase) ?? 0;
        const dropRate = changePct(currentWeekCount, previousWeekCount);
        return {
          phase,
          currentWeekCount,
          previousWeekCount,
          dropRate,
          alert: dropRate !== null && dropRate <= BOTTLENECK_DROP_THRESHOLD,
        };
      })
      .filter((row) => row.alert);

    return c.json({
      success: true,
      data: {
        lineAccountId: BALILINGUAL_ACCOUNT_ID,
        threshold: BOTTLENECK_DROP_THRESHOLD,
        alerts,
      },
    });
  } catch (err) {
    console.error('GET /api/balilingual/bottleneck error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { balilingualAnalytics };
