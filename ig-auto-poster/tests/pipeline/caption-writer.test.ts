import { describe, it, expect } from "vitest";
import { buildCaptionPrompt, formatCaption } from "../../src/pipeline/caption-writer";
import type { ContentPlan } from "../../src/pipeline/types";

describe("buildCaptionPrompt", () => {
  it("プランからキャプション生成プロンプトを組み立てる", () => {
    const plan: ContentPlan = {
      contentType: "carousel",
      formatName: "知ってた系",
      category: "cafe",
      hook: "バリのカフェ150円？",
      slides: [
        { heading: "表紙", body: "", slideType: "cover" },
        { heading: "Point1", body: "説明", icon: "☕", slideType: "point" },
      ],
      ctaText: "保存してね",
      neta: [],
    };
    const prompt = buildCaptionPrompt(plan);
    expect(prompt).toContain("バリのカフェ150円？");
    expect(prompt).toContain("cafe");
  });
});

describe("formatCaption", () => {
  it("フック+本文+CTA+ハッシュタグを結合する", () => {
    const result = formatCaption("フック文", "本文ここ", "CTA文", "cafe");
    expect(result).toContain("フック文");
    expect(result).toContain("本文ここ");
    expect(result).toContain("#バリ島");
    expect(result).toContain("LINE");
  });
});
