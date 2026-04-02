import { describe, it, expect } from "vitest";
import { formatWeeklyReport } from "../../src/ab-test/reporter";
import type { WeeklyReport } from "../../src/pipeline/types";

describe("formatWeeklyReport", () => {
  it("レポートをLINE通知用テキストにフォーマットする", () => {
    const report: WeeklyReport = {
      week: "2026-W15",
      lineRegistrations: 8,
      totalReach: 12400,
      avgSaveRate: 0.042,
      avgShareRate: 0.012,
      profileVisits: 480,
      bottleneck: "interest",
      abTestResult: {
        axis: "design",
        winner: "test",
        controlRate: 0.038,
        testRate: 0.051,
      },
      nextTestAxis: "hook",
      nextTestVariant: "question_hook",
    };
    const text = formatWeeklyReport(report);
    expect(text).toContain("2026-W15");
    expect(text).toContain("LINE登録: 8件");
    expect(text).toContain("12,400");
    expect(text).toContain("4.2%");
    expect(text).toContain("ボトルネック");
    expect(text).toContain("hook");
  });
});
