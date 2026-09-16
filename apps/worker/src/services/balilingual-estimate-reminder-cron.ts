import { jstNow } from '@line-crm/db';
import type { Message } from '@line-crm/line-sdk';
import { BALILINGUAL_LINE_ACCOUNT_ID } from './balilingual-send-estimate.js';
import {
  buildBalilingualEstimateReminderMessage,
  type BalilingualReminderStage,
} from './balilingual-reminder-messages.js';

export { BALILINGUAL_LINE_ACCOUNT_ID };

export interface BalilingualReminderLineClient {
  pushMessage(userId: string, messages: Message[]): Promise<unknown>;
}

export interface BalilingualEstimateReminderResult {
  friendId: string;
  stage: BalilingualReminderStage;
}

interface CandidateFriendRow {
  id: string;
  line_user_id: string;
  metadata: string | null;
}

interface ReminderWindow {
  stage: BalilingualReminderStage;
  metadataKey: 'last_reminder_24h_sent_at' | 'last_reminder_5d_sent_at' | 'last_reminder_14d_sent_at';
  targetMs: number;
  toleranceMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const REMINDER_WINDOWS: ReminderWindow[] = [
  {
    stage: '24h',
    metadataKey: 'last_reminder_24h_sent_at',
    targetMs: DAY_MS,
    toleranceMs: 30 * 60 * 1000,
  },
  {
    stage: '5d',
    metadataKey: 'last_reminder_5d_sent_at',
    targetMs: 5 * DAY_MS,
    toleranceMs: 2 * HOUR_MS,
  },
  {
    stage: '14d',
    metadataKey: 'last_reminder_14d_sent_at',
    targetMs: 14 * DAY_MS,
    toleranceMs: 6 * HOUR_MS,
  },
];

const EXCLUDED_TAG_NAMES = ['相談予約済', '面談希望', '配信停止', '配信停止_v4'];

export async function processBalilingualEstimateReminders(
  db: D1Database,
  lineClient: BalilingualReminderLineClient,
  now = new Date(),
): Promise<BalilingualEstimateReminderResult[]> {
  const candidates = await loadCandidates(db);
  const results: BalilingualEstimateReminderResult[] = [];

  for (const friend of candidates) {
    try {
      const metadata = parseMetadata(friend.metadata);
      const estimateSentAt = parseIso(metadata.last_estimate_sent_at);
      if (!estimateSentAt) continue;

      const stage = pickDueStage(metadata, now.getTime() - estimateSentAt.getTime());
      if (!stage) continue;

      const message = buildBalilingualEstimateReminderMessage(stage.stage, friend.id);
      await lineClient.pushMessage(friend.line_user_id, [message]);

      const sentAt = now.toISOString();
      metadata[stage.metadataKey] = sentAt;

      await db
        .prepare(
          `UPDATE friends
           SET metadata = ?, updated_at = ?
           WHERE id = ? AND line_account_id = ?`,
        )
        .bind(JSON.stringify(metadata), sentAt, friend.id, BALILINGUAL_LINE_ACCOUNT_ID)
        .run();

      await db
        .prepare(
          `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at)
           VALUES (?, ?, 'outgoing', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          friend.id,
          message.type,
          JSON.stringify({ stage: stage.stage, message }),
          jstNow(),
        )
        .run();

      results.push({ friendId: friend.id, stage: stage.stage });
    } catch (err) {
      console.error(`[balilingual-estimate-reminder] failed for friend ${friend.id}`, err);
    }
  }

  if (results.length > 0) {
    console.log(`[balilingual-estimate-reminder] sent ${results.length} reminders`);
  }

  return results;
}

async function loadCandidates(db: D1Database): Promise<CandidateFriendRow[]> {
  const tagPlaceholders = EXCLUDED_TAG_NAMES.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT f.id, f.line_user_id, f.metadata
       FROM friends f
       WHERE f.line_account_id = ?
         AND f.is_following = 1
         AND json_extract(f.metadata, '$.last_estimate_sent_at') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM friend_tags ft
           JOIN tags t ON t.id = ft.tag_id
           WHERE ft.friend_id = f.id
             AND t.name IN (${tagPlaceholders})
         )
         AND NOT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.friend_id = f.id
             AND b.line_account_id = ?
             AND b.status != 'cancelled'
         )`,
    )
    .bind(BALILINGUAL_LINE_ACCOUNT_ID, ...EXCLUDED_TAG_NAMES, BALILINGUAL_LINE_ACCOUNT_ID)
    .all<CandidateFriendRow>();
  return rows.results ?? [];
}

function pickDueStage(
  metadata: Record<string, unknown>,
  elapsedMs: number,
): ReminderWindow | null {
  for (const stage of REMINDER_WINDOWS) {
    if (typeof metadata[stage.metadataKey] === 'string') continue;
    const min = stage.targetMs - stage.toleranceMs;
    const max = stage.targetMs + stage.toleranceMs;
    if (elapsedMs >= min && elapsedMs <= max) return stage;
  }
  return null;
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

function parseIso(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
