/**
 * inquiry/handler.ts - 問い合わせ対応モジュール
 *
 * 入力: メッセージ + テナント設定 + 顧客フェーズ
 * 出力: 返信ドラフト + 承認要否
 *
 * Lステップ v3.1 Final3 のフェーズ定義に基づき、
 * フェーズごとのトーン・CTA・知識参照を切り替える。
 */

import type { HandlerInput, HandlerOutput } from "../../core/types";

/** フェーズごとの返信戦略 */
interface PhaseStrategy {
  tone: string;
  defaultCta: string;
  ctaUrl?: string;
  focusAreas: string[];
  approvalTopics: string[];
}

/** フェーズ戦略マップ（バリリンガル Lステップ v3.1 準拠） */
const PHASE_STRATEGIES: Record<string, PhaseStrategy> = {
  "01": {
    tone: "気軽さ重視。質問しやすい雰囲気づくり",
    defaultCta: "アンケートに答える",
    ctaUrl: "diagnose.html",
    focusAreas: ["コース紹介", "バリ島の魅力", "初心者OK"],
    approvalTopics: [],
  },
  "02": {
    tone: "具体的な提案。プランに合わせた訴求",
    defaultCta: "無料見積りを依頼する",
    ctaUrl: "simulate.html",
    focusAreas: ["選択プランの詳細", "1日の流れ", "卒業生の声", "費用感"],
    approvalTopics: ["料金"],
  },
  "03": {
    tone: "寄り添い。ペースを合わせる",
    defaultCta: "見積もりをお願いします",
    focusAreas: ["状況ヒアリング", "不安解消", "FAQ"],
    approvalTopics: ["料金", "見積"],
  },
  "06": {
    tone: "不安解消。体験談・FAQ活用",
    defaultCta: "30分の無料オンライン相談を予約する",
    focusAreas: ["見積内容の補足", "生活費目安", "他社比較", "面談誘導"],
    approvalTopics: ["料金", "見積", "比較"],
  },
  "08": {
    tone: "決断の後押し。具体的な次ステップ提示",
    defaultCta: "お申し込みはこちら",
    focusAreas: ["面談内容の整理", "申込み手順", "特典", "仕事との両立"],
    approvalTopics: ["料金", "入金", "申込", "キャンセル"],
  },
  "99": {
    tone: "再活性。新情報や季節ネタで接点",
    defaultCta: "無料見積りを依頼する",
    ctaUrl: "simulate.html",
    focusAreas: ["登録理由想起", "チャングー紹介", "費用リアル", "卒業生", "タイミング"],
    approvalTopics: ["料金"],
  },
  "10": {
    tone: "渡航準備の案内。期待感醸成",
    defaultCta: "渡航前チェックリストを確認",
    focusAreas: ["渡航準備", "持ち物", "ビザ", "空港送迎", "初日の流れ"],
    approvalTopics: ["入金", "キャンセル", "返金"],
  },
};

/** デフォルト戦略（不明フェーズ用） */
const DEFAULT_STRATEGY: PhaseStrategy = {
  tone: "丁寧語ベース。フランクすぎない",
  defaultCta: "LINEで気軽に質問する",
  focusAreas: ["コース紹介", "FAQ"],
  approvalTopics: ["料金", "入金", "キャンセル"],
};

/**
 * 問い合わせを処理し、返信ドラフトを生成する
 */
export function handleInquiry(input: HandlerInput): HandlerOutput {
  const strategy = PHASE_STRATEGIES[input.phase] ?? DEFAULT_STRATEGY;

  // 承認要否の判定
  const { needsApproval, approvalReason } = checkApproval(input, strategy);

  // 意図分類
  const intent = classifyIntent(input.message);

  // ドラフト生成のコンテキスト構築
  const context = buildContext(input, strategy, intent);

  return {
    draft: context.promptForLLM,
    confidence: context.confidence,
    needs_approval: needsApproval,
    approval_reason: approvalReason,
    cta: strategy.defaultCta,
  };
}

/** メッセージの意図を分類 */
interface Intent {
  type: "pricing" | "course" | "schedule" | "accommodation" | "visa" | "general" | "application" | "cancel";
  keywords: string[];
}

function classifyIntent(message: string): Intent {
  const text = message.toLowerCase();

  const intentMap: { type: Intent["type"]; keywords: string[] }[] = [
    { type: "pricing", keywords: ["料金", "費用", "いくら", "値段", "価格", "見積", "シミュレ"] },
    { type: "course", keywords: ["コース", "授業", "カリキュラム", "マンツーマン", "グループ", "TOEIC", "ワーホリ", "サーフィン", "ヨガ", "副業"] },
    { type: "schedule", keywords: ["スケジュール", "時間割", "何時", "期間", "何週間", "いつ", "時期"] },
    { type: "accommodation", keywords: ["宿泊", "寮", "部屋", "食事", "外泊", "ペア"] },
    { type: "visa", keywords: ["ビザ", "パスポート", "入国", "滞在"] },
    { type: "application", keywords: ["申し込み", "申込", "入学", "手続き", "入金", "支払"] },
    { type: "cancel", keywords: ["キャンセル", "返金", "取消", "やめ"] },
  ];

  for (const entry of intentMap) {
    const matched = entry.keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      return { type: entry.type, keywords: matched };
    }
  }

  return { type: "general", keywords: [] };
}

/** 承認要否を判定 */
function checkApproval(
  input: HandlerInput,
  strategy: PhaseStrategy,
): { needsApproval: boolean; approvalReason?: string } {
  const text = input.message.toLowerCase();

  // 承認トピックに該当するキーワードが含まれているか
  for (const topic of strategy.approvalTopics) {
    if (text.includes(topic)) {
      return {
        needsApproval: true,
        approvalReason: `「${topic}」に関する回答のため承認が必要`,
      };
    }
  }

  // 不可逆操作に関連するキーワード
  const criticalKeywords = ["キャンセル", "返金", "退会", "配信停止", "入金確認"];
  for (const kw of criticalKeywords) {
    if (text.includes(kw)) {
      return {
        needsApproval: true,
        approvalReason: `不可逆操作「${kw}」に関する対応のため承認が必要`,
      };
    }
  }

  return { needsApproval: false };
}

/** LLMに渡すプロンプトコンテキストを構築 */
interface PromptContext {
  promptForLLM: string;
  confidence: number;
}

function buildContext(
  input: HandlerInput,
  strategy: PhaseStrategy,
  intent: Intent,
): PromptContext {
  const phaseLabel = PHASE_STRATEGIES[input.phase]
    ? `フェーズ${input.phase}`
    : "不明フェーズ";

  const tagList = input.tags.length > 0
    ? input.tags.join(", ")
    : "なし";

  const historySection = input.history && input.history.length > 0
    ? `\n## 過去のやり取り（直近）\n${input.history.map((h) => `- ${h}`).join("\n")}`
    : "";

  const prompt = `## 返信ドラフト生成指示

### 顧客情報
- フェーズ: ${phaseLabel}
- タグ: ${tagList}
- 検出意図: ${intent.type}（キーワード: ${intent.keywords.join(", ") || "なし"}）
${historySection}

### 顧客メッセージ
${input.message}

### 返信ルール
- トーン: ${strategy.tone}
- 注力エリア: ${strategy.focusAreas.join(", ")}
- CTA: 「${strategy.defaultCta}」を含める
- 親しみやすいが信頼感あり。フランクすぎない丁寧語ベース
- 「!」はOK、絵文字は最小限
- 押し売りしない。相手の状況を聞き出す→提案
- 質問には即答。曖昧な場合は「確認してお伝えしますね」
- CTAは1つに絞る

### 禁止事項
- 「スタッフ常駐」と書かない（寮にスタッフ常駐していない）
- 料金は正確な数字のみ。不確かな金額を書かない
- 入学金30,000円は別途かかることを必ず伝える`;

  // 意図が明確なほど confidence が高い
  const confidence = intent.type !== "general" ? 0.8 : 0.5;

  return { promptForLLM: prompt, confidence };
}

/**
 * FAQ即答パターン（LLMを呼ばずに返せるもの）
 * 該当すれば即座にドラフトを返す。該当しなければ null。
 */
export function tryQuickAnswer(message: string): string | null {
  const text = message.toLowerCase();

  const quickAnswers: { patterns: string[]; answer: string }[] = [
    {
      patterns: ["初心者", "英語力ゼロ", "英語できない", "全然話せない"],
      answer: "初心者の方も大歓迎です! レベルに合わせたクラス分けをしているので、基礎からしっかり学べます。200名以上の卒業生のうち、多くの方が初心者からスタートされていますよ。\n\n気になるコースがあればお気軽に聞いてくださいね!",
    },
    {
      patterns: ["ビザ", "visa"],
      answer: "日本国籍の方であれば、30日以内の滞在はビザ不要です! 30日を超える場合もバリで延長手続きが可能です。詳しくはお気軽にご相談ください。",
    },
    {
      patterns: ["最短", "何日から", "1週間"],
      answer: "最短1週間から留学可能です! 1〜2週間の短期留学が人気ですよ。期間によって費用も変わりますので、料金シミュレーターで目安を確認してみてください。\n\n▶ https://balilingual.pages.dev/simulate.html",
    },
  ];

  for (const qa of quickAnswers) {
    if (qa.patterns.some((p) => text.includes(p))) {
      return qa.answer;
    }
  }

  return null;
}
