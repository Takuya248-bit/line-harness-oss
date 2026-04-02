import { describe, it, expect } from "vitest";
import {
  detectBottleneck,
  determineTestAxis,
  assignTestGroups,
} from "../../src/ab-test/manager";

describe("detectBottleneck", () => {
  it("保存率が低い場合、evaluation層を返す", () => {
    expect(detectBottleneck(0.02, 0.06, 80)).toBe("evaluation");
  });

  it("保存率OKでプロフ訪問率が低い場合、interest層を返す", () => {
    expect(detectBottleneck(0.04, 0.03, 80)).toBe("interest");
  });

  it("両方OKでLINE登録が目標未満の場合、action層を返す", () => {
    expect(detectBottleneck(0.04, 0.06, 80)).toBe("action");
  });

  it("全層OKの場合、awareness層を返す", () => {
    expect(detectBottleneck(0.04, 0.06, 110)).toBe("awareness");
  });
});

describe("determineTestAxis", () => {
  it("ボトルネックに対応するテスト軸を返す", () => {
    expect(determineTestAxis("evaluation")).toBe("design");
    expect(determineTestAxis("interest")).toBe("hook");
    expect(determineTestAxis("action")).toBe("cta");
    expect(determineTestAxis("awareness")).toBe("post_time");
  });
});

describe("assignTestGroups", () => {
  it("7投稿を5コントロール+2テストに分割する", () => {
    const groups = assignTestGroups(7, "2026-W15", "design", "dark_modern", "white_clean");
    const controls = groups.filter((g) => g.isControl);
    const tests = groups.filter((g) => !g.isControl);
    expect(controls.length).toBe(5);
    expect(tests.length).toBe(2);
    expect(tests[0]!.testVariant).toBe("dark_modern");
  });
});
