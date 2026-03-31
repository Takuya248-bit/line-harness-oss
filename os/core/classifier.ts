/**
 * classifier.ts - 入力テキストをモジュールに振り分ける
 *
 * Phase 1: キーワードマッチ（即日実装可）
 * Phase 2: LLM分類に差し替え可能（インターフェース不変）
 */

import type { ClassifyInput, ClassifyResult, ModuleType } from "./types";

/** キーワード→モジュール マッピング */
const KEYWORD_MAP: { module: ModuleType; keywords: string[]; weight: number }[] = [
  {
    module: "inquiry",
    keywords: [
      "料金", "費用", "いくら", "見積", "申し込み", "申込",
      "コース", "期間", "宿泊", "寮", "ビザ", "留学",
      "相談", "質問", "教えて", "知りたい", "興味",
      "サーフィン", "ヨガ", "ワーホリ", "英語", "TOEIC",
      "予約", "空き", "キャンセル", "入金", "支払",
    ],
    weight: 1.0,
  },
  {
    module: "research",
    keywords: [
      "調べて", "リサーチ", "調査", "比較", "競合",
      "トレンド", "市場", "データ", "統計",
    ],
    weight: 0.9,
  },
  {
    module: "content",
    keywords: [
      "記事", "ブログ", "SNS", "投稿", "LP",
      "コンテンツ", "ライティング", "SEO", "バナー",
    ],
    weight: 0.9,
  },
  {
    module: "project",
    keywords: [
      "プロジェクト", "タスク", "進捗", "スケジュール",
      "マイルストーン", "デプロイ", "リリース",
    ],
    weight: 0.8,
  },
  {
    module: "analysis",
    keywords: [
      "分析", "レポート", "KPI", "集計", "CV率",
      "コンバージョン", "開封率", "クリック率",
    ],
    weight: 0.8,
  },
];

/**
 * 入力テキストを最適なモジュールに分類する
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const text = input.text.toLowerCase();
  const scores: Record<ModuleType, number> = {
    inquiry: 0,
    research: 0,
    content: 0,
    project: 0,
    analysis: 0,
  };

  // キーワードマッチでスコアリング
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (text.includes(kw)) {
        scores[entry.module] += entry.weight;
      }
    }
  }

  // LINE チャネルからの入力はデフォルト inquiry
  if (input.channel === "line" && Object.values(scores).every((s) => s === 0)) {
    scores.inquiry = 0.5;
  }

  // cron からの入力はデフォルト analysis
  if (input.channel === "cron" && Object.values(scores).every((s) => s === 0)) {
    scores.analysis = 0.5;
  }

  // 最高スコアのモジュールを選択
  const entries = Object.entries(scores) as [ModuleType, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topModule, topScore] = entries[0];
  const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

  const confidence = totalScore > 0 ? topScore / totalScore : 0.3;

  return {
    module: topModule,
    confidence: Math.min(confidence, 1.0),
    reason: topScore > 0
      ? `キーワードマッチ: ${topModule} (score: ${topScore})`
      : `デフォルト分類: ${topModule} (channel: ${input.channel})`,
  };
}
