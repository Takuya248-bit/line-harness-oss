/**
 * 業務OS コア型定義
 * classifier.ts / audit.ts / handler.ts の入出力インターフェース
 */

/** モジュール種別 */
export type ModuleType = "inquiry" | "research" | "content" | "project" | "analysis";

/** classifier の入力 */
export interface ClassifyInput {
  /** 入力テキスト（LINEメッセージ、手動指示等） */
  text: string;
  /** 入力チャネル */
  channel: "line" | "email" | "manual" | "cron";
  /** テナントID（バリリンガル等） */
  tenant: string;
  /** 送信者の既知フェーズ（あれば） */
  phase?: string;
  /** 送信者の既知タグ（あれば） */
  tags?: string[];
}

/** classifier の出力 */
export interface ClassifyResult {
  /** 振り分け先モジュール */
  module: ModuleType;
  /** 分類の確信度 0-1 */
  confidence: number;
  /** 分類理由（デバッグ用） */
  reason: string;
}

/** handler の入力 */
export interface HandlerInput {
  /** 元のメッセージ */
  message: string;
  /** テナントID */
  tenant: string;
  /** 顧客フェーズ */
  phase: string;
  /** 顧客タグ */
  tags: string[];
  /** 過去のやり取り（直近N件） */
  history?: string[];
}

/** handler の出力 */
export interface HandlerOutput {
  /** 返信ドラフト */
  draft: string;
  /** ドラフトの確信度 0-1 */
  confidence: number;
  /** 承認が必要か */
  needs_approval: boolean;
  /** 承認が必要な理由 */
  approval_reason?: string;
  /** 使用したCTA */
  cta?: string;
  /** 参照した知識エントリ */
  knowledge_refs?: string[];
}

/** audit の入力 */
export interface AuditInput {
  /** チェック対象のドラフト */
  draft: string;
  /** テナントID */
  tenant: string;
  /** テナントの禁止ワードリスト */
  prohibited: string[];
  /** テナントの料金データ（検証用） */
  pricing?: Record<string, unknown>;
}

/** audit の出力 */
export interface AuditResult {
  /** 合格/不合格 */
  pass: boolean;
  /** 検出された問題 */
  issues: AuditIssue[];
}

export interface AuditIssue {
  /** 問題の種別 */
  type: "prohibited_word" | "pricing_mismatch" | "missing_cta" | "tone_violation";
  /** 問題の説明 */
  message: string;
  /** 問題箇所 */
  location?: string;
  /** 重大度 */
  severity: "error" | "warning";
}
