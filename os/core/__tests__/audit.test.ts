import { describe, it, expect } from "vitest";
import { audit } from "../audit";

describe("audit", () => {
  const prohibited = ["スタッフ常駐", "ココナラ", "9,500円", "LINE Harness"];
  const pricing = {
    enrollment_fee: 30000,
    plans: {
      single: { "1w": 119800, "4w": 349800 },
      pair: { "1w": 98000 },
      external: { "1w": 85000 },
    },
  };

  it("禁止ワードを検出する", () => {
    const result = audit({
      draft: "寮にはスタッフ常駐しています",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("prohibited_word");
  });

  it("複数の禁止ワードを検出する", () => {
    const result = audit({
      draft: "ココナラでスタッフ常駐サービスを提供",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(2);
  });

  it("料金表にない金額を警告する", () => {
    const result = audit({
      draft: "1週間150,000円でご案内します",
      tenant: "barilingual",
      prohibited,
      pricing,
    });
    expect(result.pass).toBe(true); // warning なので pass
    expect(result.issues.some((i) => i.type === "pricing_mismatch")).toBe(true);
  });

  it("料金表にある金額は問題なし", () => {
    const result = audit({
      draft: "1人部屋4週間は349,800円です。別途入学金30,000円がかかります",
      tenant: "barilingual",
      prohibited,
      pricing,
    });
    const pricingIssues = result.issues.filter((i) => i.type === "pricing_mismatch");
    expect(pricingIssues).toHaveLength(0);
  });

  it("CTAがない長文メッセージを警告する", () => {
    const result = audit({
      draft: "バリ島は素晴らしい場所です。英語を学ぶのに最適な環境が整っています。チャングーエリアは特にデジタルノマドに人気のスポットで、カフェやレストランも充実しています。毎日4コマの授業で着実にレベルアップできます。放課後はビーチで夕日を眺めながらリラックスできますよ。",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.issues.some((i) => i.type === "missing_cta")).toBe(true);
  });

  it("CTAが含まれていれば警告しない", () => {
    const result = audit({
      draft: "バリ島は素晴らしい場所です。詳しくはこちらをご覧ください。▶ https://balilingual.pages.dev/courses",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.issues.some((i) => i.type === "missing_cta")).toBe(false);
  });

  it("問題なしの場合は pass: true", () => {
    const result = audit({
      draft: "お問い合わせありがとうございます! 詳しくはこちらをご覧ください。",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("短い返信にはCTAチェックをスキップ", () => {
    const result = audit({
      draft: "承知しました!",
      tenant: "barilingual",
      prohibited,
    });
    expect(result.issues.some((i) => i.type === "missing_cta")).toBe(false);
  });
});
