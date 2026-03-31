import { describe, it, expect } from "vitest";
import { classify } from "../classifier";

describe("classifier", () => {
  it("料金に関する質問は inquiry に分類", () => {
    const result = classify({
      text: "料金はいくらですか？",
      channel: "line",
      tenant: "barilingual",
    });
    expect(result.module).toBe("inquiry");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("コースに関する質問は inquiry に分類", () => {
    const result = classify({
      text: "サーフィンコースについて教えて",
      channel: "line",
      tenant: "barilingual",
    });
    expect(result.module).toBe("inquiry");
  });

  it("調査依頼は research に分類", () => {
    const result = classify({
      text: "競合の料金を調べてください",
      channel: "manual",
      tenant: "barilingual",
    });
    expect(result.module).toBe("research");
  });

  it("記事作成は content に分類", () => {
    const result = classify({
      text: "SEO記事を書いて",
      channel: "manual",
      tenant: "barilingual",
    });
    expect(result.module).toBe("content");
  });

  it("分析依頼は analysis に分類", () => {
    const result = classify({
      text: "先月のCV率を分析して",
      channel: "manual",
      tenant: "barilingual",
    });
    expect(result.module).toBe("analysis");
  });

  it("LINEからの不明入力はデフォルト inquiry", () => {
    const result = classify({
      text: "こんにちは",
      channel: "line",
      tenant: "barilingual",
    });
    expect(result.module).toBe("inquiry");
  });

  it("Cronからの入力はデフォルト analysis", () => {
    const result = classify({
      text: "",
      channel: "cron",
      tenant: "barilingual",
    });
    expect(result.module).toBe("analysis");
  });

  it("複数モジュールのキーワードが混在する場合、最高スコアを選択", () => {
    const result = classify({
      text: "料金と費用の比較を調べて見積もりください",
      channel: "manual",
      tenant: "barilingual",
    });
    // 「料金」「費用」「見積」→ inquiry が優勢
    expect(result.module).toBe("inquiry");
  });

  it("confidence は 0-1 の範囲", () => {
    const result = classify({
      text: "料金はいくらですか？",
      channel: "line",
      tenant: "barilingual",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
