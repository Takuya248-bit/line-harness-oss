/**
 * Telegram Bot API 通知
 * ボタン付きメッセージ送信・force_reply送信
 *
 * callback_data は 64 バイト制限のため inquiryLogId のみを格納し、
 * LINE user id は os_inquiry_log から解決する。
 */

const TELEGRAM_API = 'https://api.telegram.org';

/**
 * 汎用Telegram通知 (ボタン無し、プレーンテキスト)。
 * 購入意思キーワード受信時など、即時に運営へ知らせたい用途。
 */
export async function notifyTelegramSimple(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('notifyTelegramSimple failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('notifyTelegramSimple error:', err);
  }
}

export interface TelegramNotifyOptions {
  botToken: string;
  chatId: string;
  lineUserId: string;
  userName: string;
  message: string;
  draft: string;
  inquiryLogId: string;
  regenCount?: number;
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * 新規問い合わせをTelegramに通知（ボタン付き）
 */
export async function notifyTelegram(options: TelegramNotifyOptions): Promise<void> {
  const regenLabel =
    options.regenCount && options.regenCount > 0 ? ` \\(再生成${options.regenCount}回目\\)` : '';

  const text = [
    `📩 *新着問い合わせ${regenLabel}*`,
    `👤 ${escapeMarkdownV2(options.userName)}`,
    ``,
    `*メッセージ:*`,
    escapeMarkdownV2(options.message),
    ``,
    `*ドラフト:*`,
    escapeMarkdownV2(options.draft),
  ].join('\n');

  const inquiryId = options.inquiryLogId;
  const inline_keyboard = [
    [{ text: '✅ 承認して送信', callback_data: `approve:${inquiryId}` }],
    [
      { text: '✏️ 修正指示', callback_data: `revise:${inquiryId}` },
      { text: '⏭️ スキップ', callback_data: `skip:${inquiryId}` },
    ],
  ];

  const res = await fetch(`${TELEGRAM_API}/bot${options.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard },
    }),
  });
  if (!res.ok) {
    console.error('notifyTelegram sendMessage failed:', res.status, await res.text());
  }
}

/**
 * 修正指示を促すforce_replyメッセージを送信
 */
export async function sendRevisePrompt(
  botToken: string,
  chatId: string,
  _inquiryLogId: string,
  _lineUserId: string,
  draft: string,
): Promise<void> {
  const text = [
    `✏️ *修正指示を入力してください*`,
    `例: 「もっと柔らかく」「CTAを外して」「料金を具体的に」`,
    ``,
    `*現在のドラフト:*`,
    escapeMarkdownV2(draft),
  ].join('\n');

  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: '修正指示を入力...',
      },
    }),
  });
  if (!res.ok) {
    console.error('sendRevisePrompt failed:', res.status, await res.text());
  }
}
