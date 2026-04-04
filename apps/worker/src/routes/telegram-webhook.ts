/**
 * Telegram Bot Webhook ハンドラ
 * - ボタンクリック (callback_query): 承認/修正指示/スキップ
 * - force_reply返信 (message.reply_to_message): 修正指示テキスト受信→再生成
 */

import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import { generateGeminiDraft } from '../services/gemini-draft.js';
import { notifyTelegram, sendRevisePrompt } from '../services/telegram-notify.js';

export const telegramWebhook = new Hono<Env>();

telegramWebhook.post('/telegram/webhook', async (c) => {
  const body = await c.req.json<TelegramUpdate>();
  const db = c.env.DB;
  const botToken = c.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = c.env.TELEGRAM_CHAT_ID ?? '';

  if (body.callback_query) {
    const query = body.callback_query;
    const data = query.data ?? '';
    const messageId = query.message?.message_id;

    await answerCallbackQuery(botToken, query.id);

    if (data.startsWith('approve:')) {
      const inquiryLogId = data.slice('approve:'.length);
      await handleApprove(c.env, db, botToken, chatId, inquiryLogId, messageId);
    } else if (data.startsWith('revise:')) {
      const inquiryLogId = data.slice('revise:'.length);
      await handleRevise(botToken, chatId, db, inquiryLogId);
    } else if (data.startsWith('skip:')) {
      await editTelegramMessage(botToken, chatId, messageId, '⏭️ スキップしました');
    }

    return c.json({ ok: true });
  }

  if (body.message?.reply_to_message) {
    const instruction = body.message.text ?? '';
    if (!instruction.trim()) {
      return c.json({ ok: true });
    }

    const pending = await db
      .prepare(
        `SELECT id, line_user_id_ref, telegram_draft FROM os_inquiry_log
         WHERE line_user_id_ref IS NOT NULL AND telegram_draft IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .first<{
        id: string;
        line_user_id_ref: string;
        telegram_draft: string;
      }>();

    if (!pending) {
      await sendTelegramMessage(botToken, chatId, '⚠️ 対象の問い合わせが見つかりませんでした');
      return c.json({ ok: true });
    }

    const regenRow = await db
      .prepare(
        `SELECT regen_count FROM inquiry_correction_log WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(pending.id)
      .first<{ regen_count: number | null }>();
    const regenCount = (regenRow?.regen_count ?? 0) + 1;

    if (regenCount > 3) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '⚠️ 再生成は最大3回までです。スキップするか手動で対応してください。',
      );
      return c.json({ ok: true });
    }

    const oilRow = await db
      .prepare(`SELECT message FROM os_inquiry_log WHERE id = ?`)
      .bind(pending.id)
      .first<{ message: string }>();

    const geminiKey = c.env.GEMINI_API_KEY ?? '';
    if (!geminiKey) {
      await sendTelegramMessage(botToken, chatId, '⚠️ GEMINI_API_KEY が設定されていません');
      return c.json({ ok: true });
    }

    const newDraft = await generateGeminiDraft({
      message: oilRow?.message ?? '',
      geminiApiKey: geminiKey,
      instruction,
      previousDraft: pending.telegram_draft,
    });

    if (!newDraft) {
      await sendTelegramMessage(botToken, chatId, '⚠️ ドラフト再生成に失敗しました');
      return c.json({ ok: true });
    }

    await db
      .prepare(
        `INSERT INTO inquiry_correction_log (inquiry_id, correction_type, instruction, original_draft, regen_count)
         VALUES (?, 'revision', ?, ?, ?)`,
      )
      .bind(pending.id, instruction, pending.telegram_draft, regenCount)
      .run();

    await db
      .prepare(`UPDATE os_inquiry_log SET telegram_draft = ? WHERE id = ?`)
      .bind(newDraft, pending.id)
      .run();

    const friendRow = await db
      .prepare(`SELECT display_name FROM friends WHERE line_user_id = ? LIMIT 1`)
      .bind(pending.line_user_id_ref)
      .first<{ display_name: string | null }>();

    await notifyTelegram({
      botToken,
      chatId,
      lineUserId: pending.line_user_id_ref,
      userName: friendRow?.display_name ?? pending.line_user_id_ref,
      message: oilRow?.message ?? '',
      draft: newDraft,
      inquiryLogId: pending.id,
      regenCount,
    });

    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

async function handleApprove(
  env: Env['Bindings'],
  db: D1Database,
  botToken: string,
  chatId: string,
  inquiryLogId: string,
  messageId?: number,
): Promise<void> {
  const row = await db
    .prepare(`SELECT telegram_draft, line_user_id FROM os_inquiry_log WHERE id = ?`)
    .bind(inquiryLogId)
    .first<{ telegram_draft: string | null; line_user_id: string }>();

  if (!row?.telegram_draft || !row.line_user_id) {
    await sendTelegramMessage(botToken, chatId, '⚠️ ドラフトが見つかりませんでした');
    return;
  }

  const lineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
  try {
    await lineClient.pushMessage(row.line_user_id, [{ type: 'text', text: row.telegram_draft }]);
  } catch (err) {
    console.error('LINE push error:', err);
    await sendTelegramMessage(botToken, chatId, '⚠️ LINE送信に失敗しました');
    return;
  }

  await db
    .prepare(
      `INSERT INTO inquiry_correction_log (inquiry_id, correction_type, original_draft, final_draft)
       VALUES (?, 'approved', ?, ?)`,
    )
    .bind(inquiryLogId, row.telegram_draft, row.telegram_draft)
    .run();

  await db.prepare(`UPDATE os_inquiry_log SET status = 'replied' WHERE id = ?`).bind(inquiryLogId).run();

  if (messageId) {
    await editTelegramMessage(botToken, chatId, messageId, '✅ LINE送信完了');
  }
}

async function handleRevise(
  botToken: string,
  chatId: string,
  db: D1Database,
  inquiryLogId: string,
): Promise<void> {
  const row = await db
    .prepare(`SELECT telegram_draft, line_user_id FROM os_inquiry_log WHERE id = ?`)
    .bind(inquiryLogId)
    .first<{ telegram_draft: string | null; line_user_id: string }>();

  await db
    .prepare(`UPDATE os_inquiry_log SET line_user_id_ref = line_user_id WHERE id = ?`)
    .bind(inquiryLogId)
    .run();

  await sendRevisePrompt(
    botToken,
    chatId,
    inquiryLogId,
    row?.line_user_id ?? '',
    row?.telegram_draft ?? '',
  );
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function editTelegramMessage(
  botToken: string,
  chatId: string,
  messageId: number | undefined,
  text: string,
): Promise<void> {
  if (messageId == null) return;
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; text?: string };
  };
  message?: {
    text?: string;
    reply_to_message?: { message_id: number };
  };
}
