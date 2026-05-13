import type { LineClient } from '@line-crm/line-sdk';
import {
  getSurveyChoices,
  getSurveyQuestions,
  jstNow,
  startFriendSurvey,
} from '@line-crm/db';
import { buildBalilingualSlotsFlex } from './balilingual-booking-flex.js';
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

export async function handleBalilingualEstimatePostback(input: HandlerInput): Promise<BalilingualPostbackResult> {
  if (input.lineAccountId !== BALILINGUAL_LINE_ACCOUNT_ID) {
    return { handled: false };
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
