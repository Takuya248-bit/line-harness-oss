/**
 * research/handler.ts - 調査・分析モジュール
 *
 * 入力: リサーチ依頼メッセージ + テナント + コンテキスト
 * 出力: 調査指示プロンプト + 承認要否
 *
 * 調査カテゴリ（competitor/market/technology/general）ごとに
 * フォーカスエリアとプロンプト構造を切り替える。
 */

import type { HandlerInput, HandlerOutput } from "../../core/types";

/** 調査カテゴリ別の戦略 */
interface ResearchStrategy {
  category: string;
  focusAreas: string[];
  outputFormat: string;
  knowledgeCategory: string;
}

/** 調査カテゴリ戦略マップ */
const RESEARCH_STRATEGIES: Record<string, ResearchStrategy> = {
  competitor: {
    category: "競合調査",
    focusAreas: [
      "サービス内容・料金体系",
      "強み・弱み",
      "顧客層・ポジショニング",
      "最新の動向・変化",
    ],
    outputFormat: "比較表 + 差別化ポイント + 対応アクション",
    knowledgeCategory: "case",
  },
  market: {
    category: "市場調査",
    focusAreas: [
      "市場規模・成長率",
      "主要プレイヤー",
      "トレンド・顧客ニーズ",
      "規制・法律リスク",
    ],
    outputFormat: "市場概況 + 機会 + 脅威 + 数値根拠",
    knowledgeCategory: "market",
  },
  technology: {
    category: "技術調査",
    focusAreas: [
      "仕様・制約・上限値",
      "料金体系（無料枠・従量課金）",
      "ベストプラクティス",
      "既知の問題・回避策",
    ],
    outputFormat: "技術概要 + 実装上の注意 + コスト見積もり + 出典URL",
    knowledgeCategory: "technology",
  },
  general: {
    category: "一般調査",
    focusAreas: [
      "事実確認・ファクトチェック",
      "一次情報源の特定",
      "数値・日付の検証",
    ],
    outputFormat: "結論 + 根拠 + 信頼度",
    knowledgeCategory: "method",
  },
};

/** デフォルト戦略 */
const DEFAULT_STRATEGY = RESEARCH_STRATEGIES.general;

/**
 * リサーチ依頼を処理し、調査指示プロンプトを生成する
 */
export function handleResearch(input: HandlerInput): HandlerOutput {
  const intent = classifyIntent(input.message);
  const strategy = RESEARCH_STRATEGIES[intent.type] ?? DEFAULT_STRATEGY;
  const context = buildContext(input, strategy, intent);

  return {
    draft: context.promptForLLM,
    confidence: context.confidence,
    needs_approval: false, // 調査は承認不要
    knowledge_refs: [strategy.knowledgeCategory],
  };
}

/** 調査の意図分類 */
interface ResearchIntent {
  type: "competitor" | "market" | "technology" | "general";
  keywords: string[];
  subject: string;
}

function classifyIntent(message: string): ResearchIntent {
  const text = message.toLowerCase();

  const intentMap: { type: ResearchIntent["type"]; keywords: string[] }[] = [
    {
      type: "competitor",
      keywords: ["競合", "他社", "比較", "competitor", "ライバル", "vs", "対抗"],
    },
    {
      type: "market",
      keywords: ["市場", "業界", "トレンド", "需要", "規模", "動向", "market"],
    },
    {
      type: "technology",
      keywords: ["api", "技術", "ライブラリ", "フレームワーク", "料金", "仕様", "制約", "実装"],
    },
  ];

  for (const entry of intentMap) {
    const matched = entry.keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      return { type: entry.type, keywords: matched, subject: extractSubject(message) };
    }
  }

  return { type: "general", keywords: [], subject: extractSubject(message) };
}

/** メッセージから調査対象を抽出（簡易） */
function extractSubject(message: string): string {
  // 最初の50文字を調査対象の要約として使用
  return message.length > 50 ? `${message.slice(0, 50)}...` : message;
}

/** LLMに渡す調査指示プロンプトを構築 */
interface PromptContext {
  promptForLLM: string;
  confidence: number;
}

function buildContext(
  input: HandlerInput,
  strategy: ResearchStrategy,
  intent: ResearchIntent,
): PromptContext {
  const historySection =
    input.history && input.history.length > 0
      ? `\n## 過去のやり取り（直近）\n${input.history.map((h) => `- ${h}`).join("\n")}`
      : "";

  const tagSection =
    input.tags.length > 0 ? `\n- タグ: ${input.tags.join(", ")}` : "";

  const prompt = `## 調査指示

### 調査依頼
${input.message}

### 調査カテゴリ
${strategy.category}（検出キーワード: ${intent.keywords.join(", ") || "なし"}）
${tagSection}
${historySection}

### 調査フォーカスエリア
${strategy.focusAreas.map((area) => `- ${area}`).join("\n")}

### 調査ルール
- ソースURLを必ず明記する（一次情報を優先）
- 数値・料金・日付は必ずダブルチェックする
- 不明点は「未確認」と明記する
- 不確かな情報は信頼度を添える
- 最大 5 ソースまで参照する

### 出力フォーマット
${strategy.outputFormat}

### 知識DB投入先カテゴリ
${strategy.knowledgeCategory}`;

  const confidence = intent.type !== "general" ? 0.85 : 0.6;

  return { promptForLLM: prompt, confidence };
}
