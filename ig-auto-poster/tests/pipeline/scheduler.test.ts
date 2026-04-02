import { describe, it, expect } from "vitest";
import { buildScheduleDates, buildInsertParams } from "../../src/pipeline/scheduler";
import type { ABTestMeta } from "../../src/pipeline/types";

describe("buildScheduleDates", () => {
  it("月曜起点で7日分の日付を生成する", () => {
    const dates = buildScheduleDates("2026-04-06", 7);
    expect(dates).toEqual([
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09",
      "2026-04-10", "2026-04-11", "2026-04-12",
    ]);
  });
});

describe("buildInsertParams", () => {
  it("投稿データをD1 INSERT用パラメータに変換する", () => {
    const meta: ABTestMeta = {
      contentType: "carousel",
      testWeek: "2026-W15",
      testAxis: "design",
      testVariant: "dark_modern",
      isControl: false,
    };
    const params = buildInsertParams(
      "carousel",
      '{"slides":[]}',
      "caption text",
      '["url1","url2"]',
      "2026-04-06",
      "18:00",
      meta,
    );
    expect(params.length).toBe(7);
    expect(params[4]).toBe("2026-04-06");
  });
});
