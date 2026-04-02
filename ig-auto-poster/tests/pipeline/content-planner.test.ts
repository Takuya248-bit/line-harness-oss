import { describe, it, expect } from "vitest";
import { buildPromptForPlan, parseContentPlan, selectBuzzFormat } from "../../src/pipeline/content-planner";
import type { NetaEntry } from "../../src/pipeline/types";

describe("selectBuzzFormat", () => {
  it("重み付きランダムでフォーマットを選択する", () => {
    const formats = [
      { name: "知ってた系", weight: 10 },
      { name: "ランキング系", weight: 5 },
    ];
    const result = selectBuzzFormat(formats);
    expect(formats.map((f) => f.name)).toContain(result);
  });
});

describe("buildPromptForPlan", () => {
  it("ネタとフォーマットからプロンプトを組み立てる", () => {
    const neta: NetaEntry[] = [
      { id: "1", title: "チャングーのカフェ", content: "地元民に人気のカフェ3選", category: "cafe", tags: ["bali_cafe"], reliability: "firsthand", source: "firsthand" },
    ];
    const prompt = buildPromptForPlan("知ってた系", "cafe", neta);
    expect(prompt).toContain("知ってた系");
    expect(prompt).toContain("チャングーのカフェ");
    expect(prompt).toContain("8-10枚");
  });
});

describe("parseContentPlan", () => {
  it("Groqレスポンスをパースする", () => {
    const json = JSON.stringify({
      hook: "バリのカフェ、150円って知ってた？",
      slides: [
        { heading: "表紙", body: "", slideType: "cover" },
        { heading: "ポイント1", body: "説明文", icon: "☕", slideType: "point" },
        { heading: "まとめ", body: "一覧", slideType: "summary" },
        { heading: "CTA", body: "保存してね", slideType: "cta" },
      ],
      ctaText: "プロフのLINEから無料相談",
    });
    const plan = parseContentPlan(json, "carousel", "知ってた系", "cafe", []);
    expect(plan.hook).toBe("バリのカフェ、150円って知ってた？");
    expect(plan.slides.length).toBe(4);
    expect(plan.slides[0].slideType).toBe("cover");
  });
});
