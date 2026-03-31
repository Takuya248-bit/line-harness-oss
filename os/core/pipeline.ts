/**
 * pipeline.ts - 業務OSパイプラインエントリポイント
 *
 * intake → classify → handler → audit → approval → notify → archive
 *
 * 各ステージは独立した関数で、テスト・差替えが容易。
 */

import { classify } from "./classifier";
import { audit } from "./audit";
import { handleInquiry, tryQuickAnswer } from "../modules/inquiry/handler";
import type {
  ClassifyInput,
  ClassifyResult,
  HandlerInput,
  HandlerOutput,
  AuditResult,
} from "./types";

/** パイプライン全体の結果 */
export interface PipelineResult {
  classification: ClassifyResult;
  handler?: HandlerOutput;
  audit?: AuditResult;
  quickAnswer?: string;
  status: "draft_ready" | "approval_needed" | "audit_failed" | "unsupported_module";
}

/**
 * パイプラインを実行する
 *
 * @param classifyInput - classifier への入力
 * @param handlerInput - handler への入力（classify 後に構築）
 * @param prohibited - テナントの禁止ワードリスト
 * @param pricing - テナントの料金データ
 */
export function runPipeline(
  classifyInput: ClassifyInput,
  handlerInput: Omit<HandlerInput, "phase"> & { phase?: string },
  prohibited: string[],
  pricing?: Record<string, unknown>,
): PipelineResult {
  // 1. classify
  const classification = classify(classifyInput);

  // 2. module dispatch
  if (classification.module !== "inquiry") {
    return {
      classification,
      status: "unsupported_module",
    };
  }

  // 3. FAQ即答チェック
  const quickAnswer = tryQuickAnswer(handlerInput.message);
  if (quickAnswer) {
    const auditResult = audit({
      draft: quickAnswer,
      tenant: handlerInput.tenant,
      prohibited,
      pricing,
    });

    return {
      classification,
      quickAnswer,
      audit: auditResult,
      status: auditResult.pass ? "draft_ready" : "audit_failed",
    };
  }

  // 4. handler
  const fullInput: HandlerInput = {
    ...handlerInput,
    phase: handlerInput.phase ?? "99",
  };
  const handlerResult = handleInquiry(fullInput);

  // 5. audit
  const auditResult = audit({
    draft: handlerResult.draft,
    tenant: handlerInput.tenant,
    prohibited,
    pricing,
  });

  // 6. status 判定
  let status: PipelineResult["status"];
  if (!auditResult.pass) {
    status = "audit_failed";
  } else if (handlerResult.needs_approval) {
    status = "approval_needed";
  } else {
    status = "draft_ready";
  }

  return {
    classification,
    handler: handlerResult,
    audit: auditResult,
    status,
  };
}
