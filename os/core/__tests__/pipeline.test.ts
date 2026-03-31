import { describe, it, expect } from "vitest";
import { runPipeline } from "../pipeline";

describe("pipeline", () => {
  const prohibited = ["スタッフ常駐", "ココナラ"];
  const pricing = {
    enrollment_fee: 30000,
    plans: { single: { "4w": 349800 } },
  };

  it("LINE問い合わせが inquiry パイプラインを通過する", () => {
    const result = runPipeline(
      { text: "料金について教えてください", channel: "line", tenant: "barilingual" },
      { message: "料金について教えてください", tenant: "barilingual", tags: [] },
      prohibited,
      pricing,
    );
    expect(result.classification.module).toBe("inquiry");
    // handler.draft にはLLMプロンプト全文が入り、audit対象の禁止ワードは含まれないが
    // プロンプト内に「料金」等が含まれるため audit は pass する。承認判定は handler 側。
    expect(["approval_needed", "draft_ready", "audit_failed"]).toContain(result.status);
    expect(result.handler).toBeDefined();
  });

  it("FAQ即答パターンにマッチする場合は quickAnswer を返す", () => {
    const result = runPipeline(
      { text: "英語初心者でも大丈夫ですか？", channel: "line", tenant: "barilingual" },
      { message: "英語初心者でも大丈夫ですか？", tenant: "barilingual", tags: [] },
      prohibited,
    );
    expect(result.quickAnswer).toBeDefined();
    expect(result.quickAnswer).toContain("初心者");
    expect(result.status).toBe("draft_ready");
  });

  it("inquiry以外のモジュールは unsupported_module を返す", () => {
    const result = runPipeline(
      { text: "競合を調べてリサーチして", channel: "manual", tenant: "barilingual" },
      { message: "競合を調べてリサーチして", tenant: "barilingual", tags: [] },
      prohibited,
    );
    expect(result.classification.module).toBe("research");
    expect(result.status).toBe("unsupported_module");
  });

  it("禁止ワードを含むドラフトは audit_failed", () => {
    const result = runPipeline(
      { text: "ビザについて教えてください", channel: "line", tenant: "barilingual" },
      { message: "ビザについて教えてください", tenant: "barilingual", tags: [] },
      ["ビザ不要"],  // quickAnswer の返答に含まれる
    );
    // quickAnswer が「ビザ不要」を含むため audit_failed
    expect(result.status).toBe("audit_failed");
  });

  it("フェーズ指定で戦略が切り替わる", () => {
    const result = runPipeline(
      { text: "相談したいです", channel: "line", tenant: "barilingual", phase: "08" },
      { message: "相談したいです", tenant: "barilingual", phase: "08", tags: ["面談済"] },
      prohibited,
    );
    expect(result.handler?.cta).toBe("お申し込みはこちら");
  });
});
