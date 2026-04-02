import type { WeeklyReport } from "../pipeline/types";
import { detectBottleneck, determineTestAxis, judgeWinner } from "./manager";

const LINE_REG_WEEKLY_TARGET = 100 / 4.33;

export function formatWeeklyReport(report: WeeklyReport): string {
  const saveRatePct = (report.avgSaveRate * 100).toFixed(1);
  const shareRatePct = (report.avgShareRate * 100).toFixed(1);

  const bottleneckLabels: Record<string, string> = {
    awareness: "認知層（リーチ）",
    evaluation: "評価層（保存率）",
    interest: "興味層（プロフ訪問率）",
    action: "行動層（LINE登録）",
  };

  let abSection = "A/Bテスト: 結果なし";
  if (report.abTestResult) {
    const r = report.abTestResult;
    const controlPct = (r.controlRate * 100).toFixed(1);
    const testPct = (r.testRate * 100).toFixed(1);
    const winnerLabel = r.winner === "test" ? "テスト群 勝利" : r.winner === "control" ? "コントロール群 勝利" : "判定不能";
    abSection = `A/Bテスト結果:\n  軸: ${r.axis}\n  ${winnerLabel}（テスト${testPct}% vs コントロール${controlPct}%）`;
  }

  return `週次レポート ${report.week}

LINE登録: ${report.lineRegistrations}件（目標${Math.ceil(LINE_REG_WEEKLY_TARGET)}件/週）
リーチ: ${report.totalReach.toLocaleString()}
保存率: ${saveRatePct}%
シェア率: ${shareRatePct}%
プロフ訪問: ${report.profileVisits}

${abSection}

ボトルネック: ${bottleneckLabels[report.bottleneck] ?? report.bottleneck}
次週テスト軸: ${report.nextTestAxis}
テスト内容: ${report.nextTestVariant}`;
}

export async function buildWeeklyReport(
  db: D1Database,
  week: string,
  lineRegistrations: number,
): Promise<WeeklyReport> {
  const rows = await db
    .prepare(
      `SELECT sq.id, atr.reach, atr.saves, atr.shares, atr.profile_visits, atr.save_rate
       FROM schedule_queue sq
       LEFT JOIN ab_test_results atr ON atr.queue_id = sq.id
       WHERE sq.status = 'posted'
         AND sq.ab_test_meta LIKE ?`,
    )
    .bind(`%"testWeek":"${week}"%`)
    .all<{ id: number; reach: number | null; saves: number | null; shares: number | null; profile_visits: number | null; save_rate: number | null }>();

  const posted = rows.results.filter((r) => r.reach != null);
  const totalReach = posted.reduce((s, r) => s + (r.reach ?? 0), 0);
  const avgSaveRate = posted.length > 0
    ? posted.reduce((s, r) => s + (r.save_rate ?? 0), 0) / posted.length
    : 0;
  const avgShareRate = posted.length > 0
    ? posted.reduce((s, r) => s + ((r.shares ?? 0) / Math.max(r.reach ?? 1, 1)), 0) / posted.length
    : 0;
  const profileVisits = posted.reduce((s, r) => s + (r.profile_visits ?? 0), 0);
  const profileVisitRate = totalReach > 0 ? profileVisits / totalReach : 0;

  const bottleneck = detectBottleneck(avgSaveRate, profileVisitRate, lineRegistrations);
  const nextTestAxis = determineTestAxis(bottleneck);

  const activeTest = await db
    .prepare("SELECT id, test_axis, test_variant FROM ab_tests WHERE test_week = ? LIMIT 1")
    .bind(week)
    .first<{ id: number; test_axis: string; test_variant: string }>();

  let abTestResult: WeeklyReport["abTestResult"] = null;
  if (activeTest) {
    const winner = await judgeWinner(db, activeTest.id);
    const controlRows2 = await db
      .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 1 AND save_rate IS NOT NULL")
      .bind(activeTest.id)
      .all<{ save_rate: number }>();
    const testRows2 = await db
      .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 0 AND save_rate IS NOT NULL")
      .bind(activeTest.id)
      .all<{ save_rate: number }>();

    const controlAvg = controlRows2.results.length > 0
      ? controlRows2.results.reduce((s, r) => s + r.save_rate, 0) / controlRows2.results.length
      : 0;
    const testAvg = testRows2.results.length > 0
      ? testRows2.results.reduce((s, r) => s + r.save_rate, 0) / testRows2.results.length
      : 0;

    abTestResult = {
      axis: activeTest.test_axis,
      winner,
      controlRate: controlAvg,
      testRate: testAvg,
    };

    if (winner === "test") {
      await db
        .prepare("INSERT INTO winning_patterns (axis, variant_value, save_rate, test_week) VALUES (?, ?, ?, ?)")
        .bind(activeTest.test_axis, activeTest.test_variant, testAvg, week)
        .run();
    }
    await db
      .prepare("UPDATE ab_tests SET status = 'completed', winner = ?, completed_at = datetime('now') WHERE id = ?")
      .bind(winner, activeTest.id)
      .run();
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO weekly_kpi (week, total_reach, avg_save_rate, avg_share_rate, profile_visits, line_registrations, bottleneck)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(week, totalReach, avgSaveRate, avgShareRate, profileVisits, lineRegistrations, bottleneck)
    .run();

  return {
    week,
    lineRegistrations,
    totalReach,
    avgSaveRate,
    avgShareRate,
    profileVisits,
    bottleneck,
    abTestResult,
    nextTestAxis,
    nextTestVariant: `${nextTestAxis}_variant_auto`,
  };
}
