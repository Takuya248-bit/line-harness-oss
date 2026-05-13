import { notifyTelegramSimple } from './telegram-notify.js';
import type { Estimate } from './balilingual-estimator/index.js';

export const BALILINGUAL_HIGH_VALUE_THRESHOLD = 800_000;

export interface HighValueEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_NOTIFY?: string;
}

export interface HighValueNotifyInput {
  estimate: Estimate;
  planInterest?: string;
  friendId: string;
  displayName?: string | null;
}

export function isBalilingualHighValue(input: {
  total: number;
  isParentChild: boolean;
  planInterest?: string;
}): boolean {
  return (
    input.total > BALILINGUAL_HIGH_VALUE_THRESHOLD ||
    input.isParentChild ||
    input.planInterest === 'exam_other'
  );
}

export function buildHighValueNotifyText(input: HighValueNotifyInput): string {
  const name = input.displayName?.trim() || 'お客様';
  const planLabel = input.estimate.plan === 'pair' ? 'ペア' : input.estimate.planLabel;
  const parentChildSuffix = input.estimate.isParentChild ? ` 親子${input.estimate.pax}名` : '';
  return [
    `[balilingual] 高単価見込: ${name}様,`,
    `${planLabel}${input.estimate.weeks}週${parentChildSuffix},`,
    `合計${input.estimate.total.toLocaleString()}円,`,
    `friend_id=${input.friendId}`,
  ].join(' ');
}

export async function notifyBalilingualHighValue(
  env: HighValueEnv | undefined,
  input: HighValueNotifyInput,
): Promise<boolean> {
  if (!isBalilingualHighValue({
    total: input.estimate.total,
    isParentChild: input.estimate.isParentChild,
    planInterest: input.planInterest,
  })) {
    return false;
  }

  if (env?.TELEGRAM_NOTIFY === '0' || env?.TELEGRAM_NOTIFY === 'false') {
    return true;
  }

  if (!env?.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return true;
  }

  await notifyTelegramSimple(
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_CHAT_ID,
    buildHighValueNotifyText(input),
  );
  return true;
}
