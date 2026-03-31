/**
 * audit.ts - 送信前チェック
 *
 * ドラフトテキストを検証し、禁止ワード・料金誤り等を検出する。
 * Hooks (PreToolUse) でLINE送信API呼び出し前に自動実行される。
 */

import type { AuditInput, AuditResult, AuditIssue } from "./types";

/**
 * ドラフトを監査し、問題を検出する
 */
export function audit(input: AuditInput): AuditResult {
  const issues: AuditIssue[] = [];

  // 1. 禁止ワードチェック
  for (const word of input.prohibited) {
    if (input.draft.includes(word)) {
      issues.push({
        type: "prohibited_word",
        message: `禁止ワード「${word}」が含まれています`,
        location: word,
        severity: "error",
      });
    }
  }

  // 2. 料金チェック（ドラフト内の金額がテナント料金表と一致するか）
  if (input.pricing) {
    const pricePattern = /[\d,]+円/g;
    const matches = input.draft.match(pricePattern);
    if (matches) {
      const validPrices = extractAllPrices(input.pricing);
      for (const match of matches) {
        const numStr = match.replace(/[円,]/g, "");
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > 1000 && !validPrices.has(num)) {
          issues.push({
            type: "pricing_mismatch",
            message: `料金「${match}」が料金表に存在しません。正しい金額か確認してください`,
            location: match,
            severity: "warning",
          });
        }
      }
    }
  }

  // 3. CTA欠如チェック
  const ctaPatterns = [
    "見積", "相談", "予約", "申し込み", "申込",
    "こちら", "▶", "▼", "→",
    "https://", "http://",
  ];
  const hasCta = ctaPatterns.some((p) => input.draft.includes(p));
  if (!hasCta && input.draft.length > 100) {
    issues.push({
      type: "missing_cta",
      message: "CTAが見つかりません。次のアクションを明示してください",
      severity: "warning",
    });
  }

  return {
    pass: issues.every((i) => i.severity !== "error"),
    issues,
  };
}

/**
 * 料金データから全有効価格を抽出
 */
function extractAllPrices(pricing: Record<string, unknown>): Set<number> {
  const prices = new Set<number>();

  function walk(obj: unknown): void {
    if (typeof obj === "number") {
      prices.add(obj);
    } else if (typeof obj === "object" && obj !== null) {
      for (const val of Object.values(obj)) {
        walk(val);
      }
    }
  }

  walk(pricing);
  return prices;
}
