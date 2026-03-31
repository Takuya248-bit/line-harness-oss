/**
 * content/handler.ts - コンテンツ作成モジュール
 *
 * 入力: コンテンツ依頼メッセージ + テナント + コンテキスト
 * 出力: コンテンツ生成プロンプト + 承認要否（基本 true）
 *
 * コンテンツタイプ（article/sns/lp/email）ごとに
 * プロンプト構造・SEOルール・CTA方針を切り替える。
 */

import type { HandlerInput, HandlerOutput } from "../../core/types";

/** コンテンツタイプ別の戦略 */
interface ContentStrategy {
  type: string;
  label: string;
  focusAreas: string[];
  outputFormat: string;
  prohibitions: string[];
}

/** コンテンツタイプ戦略マップ */
const CONTENT_STRATEGIES: Record<string, ContentStrategy> = {
  article: {
    type: "article",
    label: "記事",
    focusAreas: [
      "SEOキーワードを自然に含める",
      "一次情報・実体験・数字を盛り込む",
      "読者の検索意図に答える構成",
      "見出しH2/H3で論理的に整理",
    ],
    outputFormat: "タイトル + メタディスクリプション + 本文（見出し構成付き）",
    prohibitions: [
      "テンプレ感のある表現",
      "根拠のない断定表現",
      "過度なキーワード詰め込み",
    ],
  },
  sns: {
    type: "sns",
    label: "SNS投稿",
    focusAreas: [
      "一次情報（実体験・数字・現地情報）を最優先",
      "冒頭1行でスクロールを止める",
      "テンプレ感を排除した自然な文体",
      "エンゲージメントを促す問いかけ",
    ],
    outputFormat: "投稿本文 + ハッシュタグ候補",
    prohibitions: [
      "引用RT・他者投稿の自動投稿",
      "テンプレ・定型文",
      "確認できない数字の使用",
    ],
  },
  lp: {
    type: "lp",
    label: "LP",
    focusAreas: [
      "ファーストビューでベネフィットを明示",
      "CTA（行動喚起）を複数設置",
      "社会的証明（実績・声・数字）を活用",
      "FAQ で離脱を防ぐ",
    ],
    outputFormat: "セクション構成 + コピー + CTA文言",
    prohibitions: [
      "ログインリンクのCTA（lp/index.htmlは編集禁止）",
      "ソーシャルログインの追加",
      "料金・特典の不確かな記載",
    ],
  },
  email: {
    type: "email",
    label: "メール",
    focusAreas: [
      "件名で開封率を高める",
      "冒頭3行でメリットを伝える",
      "1メール1アクション原則",
      "顧客フェーズに合わせたトーン",
    ],
    outputFormat: "件名 + 本文 + CTA",
    prohibitions: [
      "複数CTAの混在",
      "スパムフィルターに引っかかる表現",
    ],
  },
};

/** デフォルト戦略 */
const DEFAULT_STRATEGY = CONTENT_STRATEGIES.article;

/**
 * コンテンツ作成依頼を処理し、生成指示プロンプトを返す
 */
export function handleContent(input: HandlerInput): HandlerOutput {
  const intent = classifyIntent(input.message);
  const strategy = CONTENT_STRATEGIES[intent.type] ?? DEFAULT_STRATEGY;
  const context = buildContext(input, strategy, intent);

  return {
    draft: context.promptForLLM,
    confidence: context.confidence,
    needs_approval: true, // コンテンツは公開前に必ずレビュー
    approval_reason: "公開前のコンテンツレビューが必要",
  };
}

/** コンテンツタイプの意図分類 */
interface ContentIntent {
  type: "article" | "sns" | "lp" | "email";
  keywords: string[];
  subject: string;
}

function classifyIntent(message: string): ContentIntent {
  const text = message.toLowerCase();

  const intentMap: { type: ContentIntent["type"]; keywords: string[] }[] = [
    {
      type: "sns",
      keywords: ["x投稿", "twitter", "instagram", "sns", "ポスト", "つぶやき", "インスタ"],
    },
    {
      type: "lp",
      keywords: ["lp", "ランディングページ", "landing", "セールスページ"],
    },
    {
      type: "email",
      keywords: ["メール", "mail", "email", "件名", "メルマガ", "ステップメール"],
    },
    {
      type: "article",
      keywords: ["記事", "ブログ", "コラム", "seo", "article", "ライティング", "執筆"],
    },
  ];

  for (const entry of intentMap) {
    const matched = entry.keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      return { type: entry.type, keywords: matched, subject: extractSubject(message) };
    }
  }

  // デフォルトは article
  return { type: "article", keywords: [], subject: extractSubject(message) };
}

/** メッセージからコンテンツテーマを抽出（簡易） */
function extractSubject(message: string): string {
  return message.length > 50 ? `${message.slice(0, 50)}...` : message;
}

/** LLMに渡すコンテンツ生成プロンプトを構築 */
interface PromptContext {
  promptForLLM: string;
  confidence: number;
}

function buildContext(
  input: HandlerInput,
  strategy: ContentStrategy,
  intent: ContentIntent,
): PromptContext {
  const historySection =
    input.history && input.history.length > 0
      ? `\n## 過去のやり取り（直近）\n${input.history.map((h) => `- ${h}`).join("\n")}`
      : "";

  const tagSection =
    input.tags.length > 0 ? `\n- タグ: ${input.tags.join(", ")}` : "";

  const prohibitionSection = strategy.prohibitions
    .map((p) => `- ${p}`)
    .join("\n");

  const prompt = `## コンテンツ作成指示

### 依頼内容
${input.message}

### コンテンツタイプ
${strategy.label}（検出キーワード: ${intent.keywords.join(", ") || "デフォルト"}）
${tagSection}
${historySection}

### 作成方針
${strategy.focusAreas.map((area) => `- ${area}`).join("\n")}

### 出力フォーマット
${strategy.outputFormat}

### 禁止事項
${prohibitionSection}

### 共通ルール
- 読者の行動変容を最優先に設計する
- 一次情報（実体験・具体的な数字・現地情報）を積極的に使う
- テンプレ感・AI感を出さず、自然な文体を維持する
- 太字（**）禁止（LINE等での表示崩れを防ぐ）`;

  const confidence = intent.keywords.length > 0 ? 0.85 : 0.65;

  return { promptForLLM: prompt, confidence };
}
