import type { LineClient } from '@line-crm/line-sdk';
import {
  createBooking,
  getSurveyChoices,
  getSurveyQuestions,
  jstNow,
  recordActions,
  startFriendSurvey,
  updateBookingGoogleEventId,
} from '@line-crm/db';
import { buildBalilingualSlotsFlex } from './balilingual-booking-flex.js';
import { buildBookingConfirmFlex } from './booking-flex.js';
import { createCalendarEvent, getAccessToken } from './google-calendar-sa.js';
import { buildMessage } from './step-delivery.js';
import { buildSurveyQuestionFlex } from './survey-flex.js';

export const BALILINGUAL_LINE_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
const CHAT_CONSULTATION_TAG_NAME = 'チャット相談中';

type FriendRow = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  line_account_id: string | null;
};

type SurveyRow = {
  id: string;
  name: string;
};

export type BalilingualEstimateAction =
  | 'book_consultation'
  | 'confirm_booking'
  | 're_estimate'
  | 'ask_question'
  | 'request_mail_brochure';

export type BalilingualPostbackResult =
  | { handled: true; action: BalilingualEstimateAction }
  | { handled: false };

type HandlerInput = {
  db: D1Database;
  lineClient: LineClient;
  replyToken: string;
  userId: string;
  lineAccountId: string | null | undefined;
  postbackData: string;
  env?: {
    BALILINGUAL_DRY_RUN_BOOKING?: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_KEY?: string;
    GOOGLE_CALENDAR_ID?: string;
  };
};

type ConfirmBookingPostback = {
  action: 'confirm_booking';
  start: string;
  end: string;
};

export function parseBalilingualEstimatePostback(data: string): {
  action: BalilingualEstimateAction;
  friendId: string;
} | null {
  const params = new URLSearchParams(data);
  const action = params.get('action');
  const friendId = params.get('friend_id');

  if (!friendId) return null;
  if (
    action !== 'book_consultation' &&
    action !== 're_estimate' &&
    action !== 'ask_question' &&
    action !== 'request_mail_brochure'
  ) {
    return null;
  }

  return { action, friendId };
}

export function isDryRunBooking(env: { BALILINGUAL_DRY_RUN_BOOKING?: string } | null | undefined): boolean {
  return env?.BALILINGUAL_DRY_RUN_BOOKING === 'true';
}

function parseConfirmBookingPostback(data: string): ConfirmBookingPostback | null {
  const params = new URLSearchParams(data);
  if (params.get('action') !== 'confirm_booking') return null;

  const start = params.get('start');
  const end = params.get('end');
  if (!start || !end) return null;

  return { action: 'confirm_booking', start, end };
}

export async function handleBalilingualEstimatePostback(input: HandlerInput): Promise<BalilingualPostbackResult> {
  if (input.lineAccountId !== BALILINGUAL_LINE_ACCOUNT_ID) {
    return { handled: false };
  }

  const confirmBooking = parseConfirmBookingPostback(input.postbackData);
  if (confirmBooking) {
    await confirmBalilingualBooking(input, confirmBooking);
    return { handled: true, action: confirmBooking.action };
  }

  const parsed = parseBalilingualEstimatePostback(input.postbackData);
  if (!parsed) {
    return { handled: false };
  }

  const friend = await getScopedFriend(input.db, parsed.friendId, input.userId);
  if (!friend) {
    console.warn('balilingual estimate postback: scoped friend not found', {
      friendId: parsed.friendId,
      userId: input.userId,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    });
    return { handled: true, action: parsed.action };
  }

  if (parsed.action === 'book_consultation') {
    await sendReplyOrPush(input.lineClient, input.replyToken, input.userId, [
      buildMessage('flex', JSON.stringify(await buildCalendarSlotsFlex(input.db))),
    ]);
    return { handled: true, action: parsed.action };
  }

  if (parsed.action === 're_estimate') {
    await restartEstimateSurvey(input.db, input.lineClient, input.replyToken, input.userId, friend.id);
    return { handled: true, action: parsed.action };
  }

  if (parsed.action === 'ask_question') {
    await ensureTagByName(input.db, friend.id, CHAT_CONSULTATION_TAG_NAME);
    await sendReplyOrPush(input.lineClient, input.replyToken, input.userId, [
      buildMessage('text', 'ご質問内容を文章でお送りください。担当スタッフが確認して返信します。'),
    ]);
    return { handled: true, action: parsed.action };
  }

  await sendReplyOrPush(input.lineClient, input.replyToken, input.userId, [
    buildMessage('text', '詳しい資料をお送りします。受け取り用のメールアドレスを教えてください。'),
  ]);
  return { handled: true, action: parsed.action };
}

async function confirmBalilingualBooking(input: HandlerInput, postback: ConfirmBookingPostback): Promise<void> {
  const friend = await getScopedFriendByLineUserId(input.db, input.userId);
  if (!friend) {
    console.warn('balilingual confirm booking: scoped friend not found', {
      userId: input.userId,
      lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    });
    return;
  }

  const dryRun = isDryRunBooking(input.env);
  let googleEventId: string | undefined;

  if (
    !dryRun &&
    input.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    input.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    input.env.GOOGLE_CALENDAR_ID
  ) {
    try {
      const accessToken = await getAccessToken({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: input.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_SERVICE_ACCOUNT_KEY: input.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        GOOGLE_CALENDAR_ID: input.env.GOOGLE_CALENDAR_ID,
      });
      const result = await createCalendarEvent(accessToken, input.env.GOOGLE_CALENDAR_ID, {
        summary: `オンライン面談 - ${friend.display_name ?? 'LINE友だち'}`,
        start: postback.start,
        end: postback.end,
        description: `LINE予約 (${friend.display_name ?? input.userId})`,
      });
      googleEventId = result.id;
    } catch (err) {
      console.warn('Google Calendar event creation failed (balilingual booking still saved):', err);
    }
  }

  const booking = await createBooking(input.db, {
    friendId: friend.id,
    lineAccountId: BALILINGUAL_LINE_ACCOUNT_ID,
    title: 'オンライン面談',
    startTime: postback.start,
    endTime: postback.end,
    googleEventId,
    isTestBooking: dryRun,
  });

  if (googleEventId) {
    await updateBookingGoogleEventId(input.db, booking.id, googleEventId);
  }

  try {
    await recordActions(input.db, friend.id, [
      { type: 'date', key: 'カウンセリング予約完了日時' },
      { type: 'count', key: 'カウンセリング予約' },
    ]);
  } catch (err) {
    console.error('Failed to record balilingual booking action:', err);
  }

  const { date, startTime, endTime } = formatBookingFlexTimes(postback.start, postback.end);
  const flex = buildBookingConfirmFlex(booking.id, date, startTime, endTime);
  await sendReplyOrPush(input.lineClient, input.replyToken, input.userId, [
    buildMessage('flex', JSON.stringify(flex)),
  ]);
}

async function getScopedFriend(db: D1Database, friendId: string, lineUserId: string): Promise<FriendRow | null> {
  return db
    .prepare(
      `SELECT id, line_user_id, display_name, line_account_id
       FROM friends
       WHERE id = ? AND line_user_id = ? AND line_account_id = ?
       LIMIT 1`,
    )
    .bind(friendId, lineUserId, BALILINGUAL_LINE_ACCOUNT_ID)
    .first<FriendRow>();
}

async function getScopedFriendByLineUserId(db: D1Database, lineUserId: string): Promise<FriendRow | null> {
  return db
    .prepare(
      `SELECT id, line_user_id, display_name, line_account_id
       FROM friends
       WHERE line_user_id = ? AND line_account_id = ?
       LIMIT 1`,
    )
    .bind(lineUserId, BALILINGUAL_LINE_ACCOUNT_ID)
    .first<FriendRow>();
}

function formatBookingFlexTimes(start: string, end: string): { date: string; startTime: string; endTime: string } {
  return {
    date: formatJstDate(start),
    startTime: formatJstTime(start),
    endTime: formatJstTime(end),
  };
}

function formatJstDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function formatJstTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));

  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  return `${hour}:${minute}`;
}

async function restartEstimateSurvey(
  db: D1Database,
  lineClient: LineClient,
  replyToken: string,
  userId: string,
  friendId: string,
): Promise<void> {
  const survey = await findEstimateSurvey(db);
  if (!survey) {
    await sendReplyOrPush(lineClient, replyToken, userId, [
      buildMessage('text', '再見積もり診断を準備中です。条件変更の内容をメッセージでお送りください。'),
    ]);
    return;
  }

  await db
    .prepare(
      `UPDATE friend_surveys
       SET status = 'cancelled', updated_at = ?
       WHERE friend_id = ?
         AND status = 'active'
         AND survey_id IN (SELECT id FROM surveys WHERE line_account_id = ?)`,
    )
    .bind(jstNow(), friendId, BALILINGUAL_LINE_ACCOUNT_ID)
    .run();

  await startFriendSurvey(db, friendId, survey.id);
  const questions = await getSurveyQuestions(db, survey.id);
  const firstQuestion = questions[0];
  if (!firstQuestion) {
    await sendReplyOrPush(lineClient, replyToken, userId, [
      buildMessage('text', '再見積もり診断を開始しました。変更したい条件をメッセージでお送りください。'),
    ]);
    return;
  }

  const choices = await getSurveyChoices(db, firstQuestion.id);
  const flex = buildSurveyQuestionFlex(survey.id, firstQuestion, choices);
  await sendReplyOrPush(lineClient, replyToken, userId, [
    buildMessage('text', '条件を変えて再見積もりします。もう一度、希望条件を教えてください。'),
    buildMessage('flex', JSON.stringify(flex)),
  ]);
}

async function findEstimateSurvey(db: D1Database): Promise<SurveyRow | null> {
  return db
    .prepare(
      `SELECT id, name
       FROM surveys
       WHERE line_account_id = ?
         AND is_active = 1
         AND (name LIKE '%見積%' OR name LIKE '%診断%')
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(BALILINGUAL_LINE_ACCOUNT_ID)
    .first<SurveyRow>();
}

async function ensureTagByName(db: D1Database, friendId: string, name: string): Promise<void> {
  let tag = await db.prepare('SELECT id FROM tags WHERE name = ? LIMIT 1').bind(name).first<{ id: string }>();
  if (!tag) {
    const id = crypto.randomUUID();
    await db
      .prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, name, '#FF6600', jstNow())
      .run();
    tag = { id };
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM friends WHERE id = ? AND line_account_id = ?
       )`,
    )
    .bind(friendId, tag.id, jstNow(), friendId, BALILINGUAL_LINE_ACCOUNT_ID)
    .run();
}

async function buildCalendarSlotsFlex(_db: D1Database): Promise<ReturnType<typeof buildBalilingualSlotsFlex>> {
  return buildBalilingualSlotsFlex([]);
}

async function sendReplyOrPush(
  lineClient: LineClient,
  replyToken: string,
  userId: string,
  messages: ReturnType<typeof buildMessage>[],
): Promise<void> {
  try {
    await lineClient.replyMessage(replyToken, messages);
  } catch {
    await lineClient.pushMessage(userId, messages);
  }
}
