import type { Message } from '@line-crm/line-sdk';
import {
  BALILINGUAL_PRICING_TABLE,
  answersToEstimateInput,
  buildEstimate,
  buildEstimateFlex,
  type DiagnosisAnswers,
  type Estimate,
} from './balilingual-estimator/index.js';
import {
  notifyBalilingualHighValue,
  type HighValueEnv,
} from './balilingual-high-value-notify.js';

export const BALILINGUAL_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
export const BALILINGUAL_SURVEY_COMPLETE_TAG_NAME = 'アンケート_回答済';

export interface EstimateLineClient {
  pushMessage(userId: string, messages: Message[]): Promise<unknown>;
}

export interface SendBalilingualEstimateInput {
  db: D1Database;
  lineClient: EstimateLineClient;
  lineAccountId: string | null | undefined;
  friendId: string;
  lineUserId: string;
  env?: HighValueEnv;
}

export interface SendBalilingualEstimateResult {
  sent: boolean;
  highValueNotified: boolean;
  estimate?: Estimate;
  reason?: string;
}

interface FriendEstimateRow {
  id: string;
  line_account_id: string | null;
  display_name: string | null;
  metadata: string | null;
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pickEstimateAnswers(metadata: Record<string, unknown>): DiagnosisAnswers {
  return {
    desired_duration: metadata.desired_duration === undefined ? undefined : String(metadata.desired_duration),
    room_type: metadata.room_type === undefined ? undefined : String(metadata.room_type),
    plan_interest: metadata.plan_interest === undefined ? undefined : String(metadata.plan_interest),
    parent_child_pax: typeof metadata.parent_child_pax === 'number'
      ? metadata.parent_child_pax
      : metadata.parent_child_pax === undefined
        ? undefined
        : String(metadata.parent_child_pax),
  };
}

async function loadBalilingualFriend(db: D1Database, friendId: string): Promise<FriendEstimateRow | null> {
  return await db
    .prepare(
      `SELECT id, line_account_id, display_name, metadata
       FROM friends
       WHERE id = ? AND line_account_id = ?
       LIMIT 1`,
    )
    .bind(friendId, BALILINGUAL_LINE_ACCOUNT_ID)
    .first<FriendEstimateRow>();
}

async function saveEstimateMetadata(
  db: D1Database,
  friend: FriendEstimateRow,
  metadata: Record<string, unknown>,
  estimate: Estimate,
): Promise<void> {
  metadata.last_estimate_sent_at = new Date().toISOString();
  metadata.last_estimate_total = estimate.total;

  await db
    .prepare(
      `UPDATE friends
       SET metadata = ?, updated_at = ?
       WHERE id = ? AND line_account_id = ?`,
    )
    .bind(JSON.stringify(metadata), new Date().toISOString(), friend.id, BALILINGUAL_LINE_ACCOUNT_ID)
    .run();
}

export async function sendBalilingualEstimate(
  input: SendBalilingualEstimateInput,
): Promise<SendBalilingualEstimateResult> {
  if (input.lineAccountId !== BALILINGUAL_LINE_ACCOUNT_ID) {
    return { sent: false, highValueNotified: false, reason: 'line_account_not_target' };
  }

  const friend = await loadBalilingualFriend(input.db, input.friendId);
  if (!friend) {
    return { sent: false, highValueNotified: false, reason: 'friend_not_target_account' };
  }

  const metadata = parseMetadata(friend.metadata);
  const answers = pickEstimateAnswers(metadata);
  const { input: estimateInput } = answersToEstimateInput(answers);
  const estimate = buildEstimate(BALILINGUAL_PRICING_TABLE, estimateInput);

  await input.lineClient.pushMessage(input.lineUserId, [buildEstimateFlex(estimate) as Message]);
  await saveEstimateMetadata(input.db, friend, metadata, estimate);

  const highValueNotified = await notifyBalilingualHighValue(input.env, {
    estimate,
    planInterest: answers.plan_interest,
    friendId: friend.id,
    displayName: friend.display_name,
  });

  return { sent: true, highValueNotified, estimate };
}

export async function isBalilingualSurveyCompleteTag(
  db: D1Database,
  lineAccountId: string | null | undefined,
  tagId: string | null | undefined,
): Promise<boolean> {
  if (lineAccountId !== BALILINGUAL_LINE_ACCOUNT_ID || !tagId) return false;
  if (tagId === BALILINGUAL_SURVEY_COMPLETE_TAG_NAME) return true;

  const row = await db
    .prepare('SELECT name FROM tags WHERE id = ? OR name = ? LIMIT 1')
    .bind(tagId, tagId)
    .first<{ name: string }>();
  return row?.name === BALILINGUAL_SURVEY_COMPLETE_TAG_NAME;
}
