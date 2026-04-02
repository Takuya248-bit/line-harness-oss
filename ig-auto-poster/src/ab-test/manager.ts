import type { ABTestMeta } from "../pipeline/types";
import { DEFAULT_DESIGNS } from "../pipeline/media-generator";

const SAVE_RATE_THRESHOLD = 0.03;
const PROFILE_VISIT_THRESHOLD = 0.05;
const LINE_REG_MONTHLY_TARGET = 100;

type Bottleneck = "awareness" | "evaluation" | "interest" | "action";
type TestAxis = "design" | "format" | "hook" | "cta" | "post_time" | "hashtag";

export function detectBottleneck(
  avgSaveRate: number,
  profileVisitRate: number,
  lineRegistrationsMonth: number,
): Bottleneck {
  if (avgSaveRate < SAVE_RATE_THRESHOLD) return "evaluation";
  if (profileVisitRate < PROFILE_VISIT_THRESHOLD) return "interest";
  if (lineRegistrationsMonth < LINE_REG_MONTHLY_TARGET) return "action";
  return "awareness";
}

const BOTTLENECK_TO_AXIS: Record<Bottleneck, TestAxis> = {
  evaluation: "design",
  interest: "hook",
  action: "cta",
  awareness: "post_time",
};

export function determineTestAxis(bottleneck: Bottleneck): TestAxis {
  return BOTTLENECK_TO_AXIS[bottleneck];
}

export function assignTestGroups(
  totalPosts: number,
  testWeek: string,
  testAxis: string,
  testVariant: string,
  controlVariant: string,
): ABTestMeta[] {
  const metas: ABTestMeta[] = [];
  const testIndices = new Set([2, 5]);

  for (let i = 0; i < totalPosts; i++) {
    const isTest = testIndices.has(i);
    metas.push({
      contentType: "carousel",
      testWeek,
      testAxis,
      testVariant: isTest ? testVariant : controlVariant,
      isControl: !isTest,
    });
  }
  return metas;
}

export async function selectTestVariant(
  db: D1Database,
  axis: TestAxis,
  currentWinner: string,
): Promise<string> {
  if (axis === "design") {
    const alternatives = DEFAULT_DESIGNS.filter((d) => d.name !== currentWinner);
    if (alternatives.length === 0) return DEFAULT_DESIGNS[0]!.name;
    const pastTests = await db
      .prepare("SELECT test_variant FROM ab_tests WHERE test_axis = 'design' AND status = 'completed' AND winner IS NULL")
      .all<{ test_variant: string }>();
    const losers = new Set(pastTests.results.map((r) => r.test_variant));
    const untested = alternatives.filter((d) => !losers.has(d.name));
    if (untested.length > 0) return untested[0]!.name;
    return alternatives[0]!.name;
  }
  return `${axis}_variant_b`;
}

export async function judgeWinner(
  db: D1Database,
  testId: number,
): Promise<string | null> {
  const controlRows = await db
    .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 1 AND save_rate IS NOT NULL")
    .bind(testId)
    .all<{ save_rate: number }>();

  const testRows = await db
    .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 0 AND save_rate IS NOT NULL")
    .bind(testId)
    .all<{ save_rate: number }>();

  if (controlRows.results.length === 0 || testRows.results.length === 0) return null;

  const controlAvg = controlRows.results.reduce((s, r) => s + r.save_rate, 0) / controlRows.results.length;
  const testAvg = testRows.results.reduce((s, r) => s + r.save_rate, 0) / testRows.results.length;

  return testAvg > controlAvg ? "test" : "control";
}

export async function createTest(
  db: D1Database,
  testWeek: string,
  testAxis: string,
  testVariant: string,
  controlVariant: string,
): Promise<number> {
  const result = await db
    .prepare(
      "INSERT INTO ab_tests (test_week, test_axis, test_variant, control_variant) VALUES (?, ?, ?, ?)",
    )
    .bind(testWeek, testAxis, testVariant, controlVariant)
    .run();
  return result.meta.last_row_id;
}
