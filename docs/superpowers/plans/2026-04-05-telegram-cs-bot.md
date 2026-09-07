# Telegram CS Bot 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バリリンガルのLINEメッセージをTelegramに通知し、Gemini 2.0 Flashのドラフトを承認/修正してLINEに自動返信する半自動CSシステムを構築する。

**Architecture:** Cloudflare Worker内にTelegram Botのwebhookエンドポイントを追加。LINEメッセージ受信時にGemini 2.0 Flashでドラフト生成→Telegramにボタン付き通知→承認/修正指示→LINE返信。修正指示はforce_replyで受け取りGeminiが再生成。全やり取りをinquiry_correction_logに保存しfew-shotとして活用。

**Tech Stack:** Cloudflare Workers (Hono), Telegram Bot API, Gemini 2.0 Flash API, Cloudflare D1

---

## ファイル構成

新規作成:
- `apps/worker/src/services/gemini-draft.ts` — Gemini 2.0 Flash API呼び出し・プロンプト構築
- `apps/worker/src/services/telegram-notify.ts` — Telegram通知・ボタン送信
- `apps/worker/src/routes/telegram-webhook.ts` — ボタンクリック/返信ハンドラ

変更:
- `apps/worker/src/routes/webhook.ts` — Groq→Gemini切替、Discord→Telegram切替
- `apps/worker/src/index.ts` — Env型にTelegram/Gemini追加、ルート登録
- `apps/worker/wrangler.toml` — 環境変数追加

---

## Task 1: 環境変数とEnv型の追加

**Files:**
- Modify: `apps/worker/wrangler.toml`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: wrangler.tomlにvarsを追加**

`apps/worker/wrangler.toml` の `[vars]` セクションに追加:
```toml
TELEGRAM_CHAT_ID = "7745195756"
```

- [ ] **Step 2: Telegram/Geminiのsecretを登録**

```bash
cd /Users/kimuratakuya/line-harness
npx wrangler secret put TELEGRAM_BOT_TOKEN --name line-crm-worker
# プロンプトに: 8631492499:AAEPSLLD_62u7mXO7iz9SMgL0ryBLF8lv2Q

npx wrangler secret put GEMINI_API_KEY --name line-crm-worker
# プロンプトに: AIzaSyCpDdZzHahynrkrkhjKgJb9BU1nRMHx7D0
```

- [ ] **Step 3: Env型にTelegram/Gemini追加**

`apps/worker/src/index.ts` の `Env` 型の `Bindings` に追加（`GROQ_API_KEY` の下）:
```typescript
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    GEMINI_API_KEY?: string;
```

- [ ] **Step 4: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -20
```
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add apps/worker/wrangler.toml apps/worker/src/index.ts
git commit -m "feat: Telegram/Gemini環境変数をEnv型に追加"
```

---

## Task 2: Geminiドラフト生成サービス

**Files:**
- Create: `apps/worker/src/services/gemini-draft.ts`

- [ ] **Step 1: gemini-draft.tsを作成**

```typescript
// apps/worker/src/services/gemini-draft.ts
/**
 * Gemini 2.0 Flash API でドラフト生成
 * context.yaml の料金/FAQ情報 + 会話履歴 + 過去承認ドラフト(few-shot) を注入
 */

export interface GeminiDraftOptions {
  message: string;          // ユーザーのLINEメッセージ
  geminiApiKey: string;
  phase?: string;           // Lステップフェーズ (01-10)
  history?: string[];       // 過去5件の会話 ["ユーザー: ...", "返信: ..."]
  fewShots?: FewShot[];     // 過去の承認ドラフト事例
  instruction?: string;     // 修正指示 (再生成時のみ)
  previousDraft?: string;   // 前回ドラフト (再生成時のみ)
}

export interface FewShot {
  message: string;
  instruction?: string;
  finalDraft: string;
}

const CONTEXT = `
## バリリンガル事業情報

### 料金（税込・円）
入学金: 30,000円（別途必須）
1人部屋: 1週間119,800円 / 2週間219,800円 / 4週間349,800円 / 8週間629,000円
ペア留学: 1週間98,000円 / 2週間189,000円 / 4週間320,000円
外泊（自己手配）: 1週間85,000円 / 2週間163,000円 / 4週間246,000円
含まれるもの: 授業料・食事(朝/昼)・空港送迎・卒業証書・学習コミュニティ
含まれないもの: 入学金・航空券・ビザ代・現地お小遣い

### コース（全9種）
英語コース / ビジネス英語 / TOEIC対策 / ワーホリ準備 / サーフィン英語 / ヨガ英語 / 副業×英語 / 短期集中 / ファミリー留学

### 授業
1日4コマ（50分）。マンツーマン中心。レベル別クラス分け。

### 滞在
3種の寮あり（全個室）。外泊（自己手配）も可。

### ビザ
日本国籍は30日以内ビザ不要。延長可能。

### 禁止事項（絶対に書かない）
- 「スタッフ常駐」と書かない（寮にスタッフ常駐していない）
- 不確かな料金を書かない
- 入学金30,000円は必ず別途と伝える
`.trim();

const PHASE_TONE: Record<string, string> = {
  '01': '気軽さ重視。質問しやすい雰囲気づくり。CTA: アンケートに答える',
  '02': '具体的な提案。プランに合わせた訴求。CTA: 無料見積りを依頼する',
  '03': '寄り添い。ペースを合わせる。CTA: 見積もりをお願いします',
  '06': '不安解消。体験談・FAQ活用。CTA: 30分の無料オンライン相談を予約する',
  '08': '決断の後押し。具体的な次ステップ。CTA: お申し込みはこちら',
  '10': '渡航準備の案内。期待感醸成。CTA: 渡航前チェックリストを確認',
  '99': '再活性。新情報や季節ネタで接点。CTA: 無料見積りを依頼する',
};

export async function generateGeminiDraft(options: GeminiDraftOptions): Promise<string | null> {
  const tone = PHASE_TONE[options.phase ?? ''] ?? '丁寧語ベース。フランクすぎない。CTA: LINEで気軽に質問する';

  // few-shot例を構築
  const fewShotSection = options.fewShots && options.fewShots.length > 0
    ? `\n## 過去の良い返信例\n` + options.fewShots.map((fs, i) =>
        `### 例${i + 1}\n質問: ${fs.message}${fs.instruction ? `\n修正指示: ${fs.instruction}` : ''}\n返信: ${fs.finalDraft}`
      ).join('\n\n')
    : '';

  // 会話履歴
  const historySection = options.history && options.history.length > 0
    ? `\n## 過去のやり取り（直近）\n${options.history.join('\n')}`
    : '';

  // 修正指示（再生成時）
  const revisionSection = options.instruction && options.previousDraft
    ? `\n## 修正指示\n前回ドラフト: ${options.previousDraft}\n指示: ${options.instruction}\n上記指示に従って返信を書き直してください。`
    : '';

  const systemPrompt = `あなたはバリリンガル（バリ島の語学学校）のCSスタッフです。
LINEで問い合わせが来た際の返信ドラフトを作成してください。

${CONTEXT}
${fewShotSection}

## 返信ルール
- トーン: ${tone}
- 親しみやすいが信頼感あり。「!」はOK、絵文字は最小限
- 押し売りしない。相手の状況を聞き出す→提案
- 質問には即答。曖昧な場合は「確認してお伝えしますね」
- CTAは1つに絞る
- 200文字以内で簡潔に
- 返信文のみを出力。前置きや説明は不要`;

  const userPrompt = `${historySection}${revisionSection}

## お客様のメッセージ
${options.message}

上記に対する返信ドラフトを書いてください。`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${options.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
          ],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      }
    );

    if (!res.ok) {
      console.error(`Gemini API error: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error('Gemini draft error:', err);
    return null;
  }
}
```

- [ ] **Step 2: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -20
```
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add apps/worker/src/services/gemini-draft.ts
git commit -m "feat: Gemini 2.0 Flashドラフト生成サービス追加"
```

---

## Task 3: Telegram通知サービス

**Files:**
- Create: `apps/worker/src/services/telegram-notify.ts`

- [ ] **Step 1: telegram-notify.tsを作成**

```typescript
// apps/worker/src/services/telegram-notify.ts
/**
 * Telegram Bot API 通知
 * ボタン付きメッセージ送信・force_reply送信
 */

const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramNotifyOptions {
  botToken: string;
  chatId: string;
  lineUserId: string;      // LINE返信先
  userName: string;        // 表示名
  message: string;         // LINEメッセージ
  draft: string;           // ドラフト
  inquiryLogId: string;    // os_inquiry_log.id
  regenCount?: number;     // 再生成回数 (0-3)
}

/**
 * 新規問い合わせをTelegramに通知（ボタン付き）
 */
export async function notifyTelegram(options: TelegramNotifyOptions): Promise<void> {
  const regenLabel = options.regenCount && options.regenCount > 0
    ? ` (再生成${options.regenCount}回目)` : '';

  const text = [
    `📩 *新着問い合わせ${regenLabel}*`,
    `👤 ${escapeMarkdown(options.userName)}`,
    ``,
    `*メッセージ:*`,
    escapeMarkdown(options.message),
    ``,
    `*ドラフト:*`,
    escapeMarkdown(options.draft),
  ].join('\n');

  const inline_keyboard = [
    [
      { text: '✅ 承認して送信', callback_data: `approve:${options.inquiryLogId}:${options.lineUserId}` },
    ],
    [
      { text: '✏️ 修正指示', callback_data: `revise:${options.inquiryLogId}:${options.lineUserId}` },
      { text: '⏭️ スキップ', callback_data: `skip:${options.inquiryLogId}` },
    ],
  ];

  await fetch(`${TELEGRAM_API}/bot${options.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard },
    }),
  });
}

/**
 * 修正指示を促すforce_replyメッセージを送信
 */
export async function sendRevisePrompt(
  botToken: string,
  chatId: string,
  inquiryLogId: string,
  lineUserId: string,
  draft: string,
): Promise<void> {
  const text = [
    `✏️ *修正指示を入力してください*`,
    `例: 「もっと柔らかく」「CTAを外して」「料金を具体的に」`,
    ``,
    `*現在のドラフト:*`,
    escapeMarkdown(draft),
  ].join('\n');

  await fetch(`${TELEGRAM_API}/bot${options.botToken}/sendMessage`, {
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
}

// MarkdownV2エスケープ
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
```

※ `sendRevisePrompt` 内の `options.botToken` は `botToken` の誤りなので修正:

```typescript
export async function sendRevisePrompt(
  botToken: string,
  chatId: string,
  inquiryLogId: string,
  lineUserId: string,
  draft: string,
): Promise<void> {
  const text = [
    `✏️ *修正指示を入力してください*`,
    `例: 「もっと柔らかく」「CTAを外して」「料金を具体的に」`,
    ``,
    `*現在のドラフト:*`,
    escapeMarkdown(draft),
  ].join('\n');

  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
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
}
```

- [ ] **Step 2: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -20
```
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add apps/worker/src/services/telegram-notify.ts
git commit -m "feat: Telegram通知サービス追加"
```

---

## Task 4: D1マイグレーション（inquiry_correction_logにintent_type追加）

**Files:**
- Create: `apps/worker/migrations/0050_add_intent_type_to_correction_log.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- apps/worker/migrations/0050_add_intent_type_to_correction_log.sql
ALTER TABLE inquiry_correction_log ADD COLUMN intent_type TEXT;
ALTER TABLE inquiry_correction_log ADD COLUMN regen_count INTEGER DEFAULT 0;
ALTER TABLE os_inquiry_log ADD COLUMN telegram_draft TEXT;
ALTER TABLE os_inquiry_log ADD COLUMN line_user_id_ref TEXT;
```

- [ ] **Step 2: マイグレーション実行**

```bash
cd /Users/kimuratakuya/line-harness
npx wrangler d1 migrations apply line-crm --remote 2>&1 | tail -10
```
Expected: `Applied 1 migration`

- [ ] **Step 3: カラム追加確認**

```bash
npx wrangler d1 execute line-crm --remote --command "PRAGMA table_info(inquiry_correction_log)" 2>&1 | grep '"name"'
```
Expected: `intent_type`, `regen_count` が含まれる

- [ ] **Step 4: コミット**

```bash
git add apps/worker/migrations/0050_add_intent_type_to_correction_log.sql
git commit -m "feat: inquiry_correction_logにintent_type/regen_count追加"
```

---

## Task 5: Telegram Webhookハンドラ

**Files:**
- Create: `apps/worker/src/routes/telegram-webhook.ts`

- [ ] **Step 1: telegram-webhook.tsを作成**

```typescript
// apps/worker/src/routes/telegram-webhook.ts
/**
 * Telegram Bot Webhook ハンドラ
 * - ボタンクリック (callback_query): 承認/修正指示/スキップ
 * - force_reply返信 (message.reply_to_message): 修正指示テキスト受信→再生成
 */

import { Hono } from 'hono';
import type { Env } from '../index.js';
import { LineClient } from '@line-crm/line-sdk';
import { generateGeminiDraft } from '../services/gemini-draft.js';
import { notifyTelegram, sendRevisePrompt } from '../services/telegram-notify.js';

const telegramWebhook = new Hono<Env>();

// Telegram stateをD1で管理（force_reply用）
// os_inquiry_logのtelegram_draftカラムを一時ストレージとして利用

telegramWebhook.post('/telegram/webhook', async (c) => {
  const body = await c.req.json<TelegramUpdate>();
  const db = c.env.DB;
  const botToken = c.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = c.env.TELEGRAM_CHAT_ID ?? '';

  // ボタンクリック処理
  if (body.callback_query) {
    const query = body.callback_query;
    const data = query.data ?? '';
    const messageId = query.message?.message_id;

    // ボタンを無効化（AnswerCallbackQuery）
    await answerCallbackQuery(botToken, query.id);

    if (data.startsWith('approve:')) {
      const [, inquiryLogId, lineUserId] = data.split(':');
      await handleApprove(c.env, db, botToken, chatId, inquiryLogId, lineUserId, messageId);
    } else if (data.startsWith('revise:')) {
      const [, inquiryLogId, lineUserId] = data.split(':');
      await handleRevise(botToken, chatId, db, inquiryLogId, lineUserId);
    } else if (data.startsWith('skip:')) {
      await editTelegramMessage(botToken, chatId, messageId, '⏭️ スキップしました');
    }

    return c.json({ ok: true });
  }

  // force_reply返信（修正指示テキスト）
  if (body.message?.reply_to_message) {
    const instruction = body.message.text ?? '';
    // D1からpending stateを取得
    const pending = await db.prepare(
      `SELECT id, line_user_id_ref, telegram_draft FROM os_inquiry_log
       WHERE line_user_id_ref IS NOT NULL AND telegram_draft IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    ).first<{ id: string; line_user_id_ref: string; telegram_draft: string }>();

    if (!pending) {
      await sendTelegramMessage(botToken, chatId, '⚠️ 対象の問い合わせが見つかりませんでした');
      return c.json({ ok: true });
    }

    // 再生成（最大3回）
    const regenRow = await db.prepare(
      `SELECT regen_count FROM inquiry_correction_log WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 1`
    ).first<{ regen_count: number }>();
    const regenCount = (regenRow?.regen_count ?? 0) + 1;

    if (regenCount > 3) {
      await sendTelegramMessage(botToken, chatId, '⚠️ 再生成は最大3回までです。スキップするか手動で対応してください。');
      return c.json({ ok: true });
    }

    const originalMessage = await db.prepare(
      `SELECT message FROM os_inquiry_log WHERE id = ?`
    ).first<{ message: string }>({ id: pending.id });

    const newDraft = await generateGeminiDraft({
      message: originalMessage?.message ?? '',
      geminiApiKey: c.env.GEMINI_API_KEY ?? '',
      instruction,
      previousDraft: pending.telegram_draft,
    });

    if (!newDraft) {
      await sendTelegramMessage(botToken, chatId, '⚠️ ドラフト再生成に失敗しました');
      return c.json({ ok: true });
    }

    // 修正指示をcorrection_logに保存
    await db.prepare(
      `INSERT INTO inquiry_correction_log (inquiry_id, correction_type, instruction, original_draft, regen_count)
       VALUES (?, 'revision', ?, ?, ?)`
    ).bind(pending.id, instruction, pending.telegram_draft, regenCount).run();

    // 新ドラフトをos_inquiry_logに更新
    await db.prepare(
      `UPDATE os_inquiry_log SET telegram_draft = ? WHERE id = ?`
    ).bind(newDraft, pending.id).run();

    // Telegramに再表示
    const friendRow = await db.prepare(
      `SELECT display_name FROM friends WHERE line_user_id = ? LIMIT 1`
    ).bind(pending.line_user_id_ref).first<{ display_name: string }>();

    await notifyTelegram({
      botToken,
      chatId,
      lineUserId: pending.line_user_id_ref,
      userName: friendRow?.display_name ?? pending.line_user_id_ref,
      message: originalMessage?.message ?? '',
      draft: newDraft,
      inquiryLogId: pending.id,
      regenCount,
    });
  }

  return c.json({ ok: true });
});

async function handleApprove(
  env: Env['Bindings'],
  db: D1Database,
  botToken: string,
  chatId: string,
  inquiryLogId: string,
  lineUserId: string,
  messageId?: number,
): Promise<void> {
  // ドラフト取得
  const row = await db.prepare(
    `SELECT telegram_draft FROM os_inquiry_log WHERE id = ?`
  ).bind(inquiryLogId).first<{ telegram_draft: string }>();

  if (!row?.telegram_draft) {
    await sendTelegramMessage(botToken, chatId, '⚠️ ドラフトが見つかりませんでした');
    return;
  }

  // LINE返信
  const lineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
  try {
    await lineClient.pushMessage(lineUserId, [{ type: 'text', text: row.telegram_draft }]);
  } catch (err) {
    console.error('LINE push error:', err);
    await sendTelegramMessage(botToken, chatId, '⚠️ LINE送信に失敗しました');
    return;
  }

  // correction_logに保存（承認）
  await db.prepare(
    `INSERT INTO inquiry_correction_log (inquiry_id, correction_type, original_draft, final_draft)
     VALUES (?, 'approved', ?, ?)`
  ).bind(inquiryLogId, row.telegram_draft, row.telegram_draft).run();

  // os_inquiry_logのstatusを更新
  await db.prepare(
    `UPDATE os_inquiry_log SET status = 'replied' WHERE id = ?`
  ).bind(inquiryLogId).run();

  // Telegramメッセージを更新
  if (messageId) {
    await editTelegramMessage(botToken, chatId, messageId, '✅ LINE送信完了');
  }
}

async function handleRevise(
  botToken: string,
  chatId: string,
  db: D1Database,
  inquiryLogId: string,
  lineUserId: string,
): Promise<void> {
  const row = await db.prepare(
    `SELECT telegram_draft FROM os_inquiry_log WHERE id = ?`
  ).bind(inquiryLogId).first<{ telegram_draft: string }>();

  // line_user_id_refを保存（force_reply処理で使用）
  await db.prepare(
    `UPDATE os_inquiry_log SET line_user_id_ref = ? WHERE id = ?`
  ).bind(lineUserId, inquiryLogId).run();

  await sendRevisePrompt(botToken, chatId, inquiryLogId, lineUserId, row?.telegram_draft ?? '');
}

// Telegram API helpers
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

async function editTelegramMessage(botToken: string, chatId: string, messageId: number | undefined, text: string): Promise<void> {
  if (!messageId) return;
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

// Telegram Update型
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

export { telegramWebhook };
```

- [ ] **Step 2: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -30
```
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add apps/worker/src/routes/telegram-webhook.ts
git commit -m "feat: Telegram webhookハンドラ追加（承認/修正指示/スキップ）"
```

---

## Task 6: index.tsにルートとEnv変数を追加

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: telegramWebhookのimportとルート登録を追加**

`apps/worker/src/index.ts` に以下を追加:

importセクション（`discordInteractions` のimportの下）に追加:
```typescript
import { telegramWebhook } from './routes/telegram-webhook.js';
```

ルート登録セクション（`app.route('/', discordInteractions)` の下）に追加:
```typescript
app.route('/', telegramWebhook);
```

- [ ] **Step 2: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -20
```
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: Telegram webhookルートをindex.tsに登録"
```

---

## Task 7: webhook.tsをGemini/Telegram対応に変更

**Files:**
- Modify: `apps/worker/src/routes/webhook.ts`

- [ ] **Step 1: importを更新**

`apps/worker/src/routes/webhook.ts` の先頭のimport部分を変更:

既存:
```typescript
import { notifyDiscord } from '../services/discord-notify.js';
import { generateDraftWithGroq } from '../services/groq-draft.js';
```

変更後:
```typescript
import { generateGeminiDraft } from '../services/gemini-draft.js';
import { notifyTelegram } from '../services/telegram-notify.js';
```

- [ ] **Step 2: ドラフト生成とDiscord通知箇所を変更**

webhook.ts の224行目付近、Discord通知ブロックを以下に差し替える:

既存コード（224-236行目付近）:
```typescript
            // Discord通知
            if (classResult.module === 'inquiry' && c.env.DISCORD_BOT_TOKEN && c.env.DISCORD_CHANNEL_ID) {
              const friend = await db.prepare(
                'SELECT display_name FROM friends WHERE line_user_id = ? LIMIT 1'
              ).bind(userId).first<any>();
              await notifyDiscord(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_CHANNEL_ID, {
                username: friend?.display_name ?? userId,
                message: text,
                module: classResult.module,
                confidence: classResult.confidence,
                draft,
                draftSource,
              });
            }
```

変更後:
```typescript
            // Telegram通知（inquiry のみ）
            if (classResult.module === 'inquiry' && c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
              // few-shot: 同じintentの過去承認ドラフトを最大3件取得
              const intentType = classResult.module;
              const fewShotRows = await db.prepare(
                `SELECT icl.original_draft as finalDraft, oil.message
                 FROM inquiry_correction_log icl
                 JOIN os_inquiry_log oil ON icl.inquiry_id = oil.id
                 WHERE icl.correction_type = 'approved' AND icl.final_draft IS NOT NULL
                 ORDER BY icl.created_at DESC LIMIT 3`
              ).all<{ finalDraft: string; message: string }>();
              const fewShots = fewShotRows.results.map(r => ({
                message: r.message,
                finalDraft: r.finalDraft,
              }));

              // 会話履歴（直近5件）
              const friendRow = await db.prepare(
                'SELECT id, display_name FROM friends WHERE line_user_id = ? LIMIT 1'
              ).bind(userId).first<{ id: string; display_name: string }>();
              const historyRows = friendRow ? await db.prepare(
                `SELECT direction, content FROM messages_log
                 WHERE friend_id = ? ORDER BY created_at DESC LIMIT 10`
              ).bind(friendRow.id).all<{ direction: string; content: string }>() : { results: [] };
              const history = historyRows.results.reverse().map(
                r => `${r.direction === 'incoming' ? 'ユーザー' : '返信'}: ${r.content}`
              );

              // Geminiでドラフト生成
              const geminiDraft = await generateGeminiDraft({
                message: text,
                geminiApiKey: c.env.GEMINI_API_KEY ?? '',
                history,
                fewShots,
              });

              // os_inquiry_logのIDを取得して telegram_draft を保存
              const logRow = await db.prepare(
                `SELECT id FROM os_inquiry_log WHERE line_user_id = ? ORDER BY created_at DESC LIMIT 1`
              ).bind(userId).first<{ id: string }>();

              if (logRow && geminiDraft) {
                await db.prepare(
                  `UPDATE os_inquiry_log SET telegram_draft = ? WHERE id = ?`
                ).bind(geminiDraft, logRow.id).run();

                await notifyTelegram({
                  botToken: c.env.TELEGRAM_BOT_TOKEN,
                  chatId: c.env.TELEGRAM_CHAT_ID,
                  lineUserId: userId,
                  userName: friendRow?.display_name ?? userId,
                  message: text,
                  draft: geminiDraft,
                  inquiryLogId: logRow.id,
                });
              }
            }
```

- [ ] **Step 3: tscで型チェック**

```bash
cd /Users/kimuratakuya/line-harness
npx tsc --noEmit -p apps/worker/tsconfig.json 2>&1 | head -30
```
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add apps/worker/src/routes/webhook.ts
git commit -m "feat: webhook.tsをGemini/Telegram対応に変更（Discord/Groq廃止）"
```

---

## Task 8: デプロイとTelegram Webhook登録

**Files:**
- None (デプロイ・設定)

- [ ] **Step 1: Workerをデプロイ**

```bash
cd /Users/kimuratakuya/line-harness
npx wrangler deploy --config apps/worker/wrangler.toml 2>&1 | tail -5
```
Expected: `Deployed line-crm-worker triggers`

- [ ] **Step 2: Telegram WebhookをWorkerに登録**

```bash
curl -s "https://api.telegram.org/bot8631492499:AAEPSLLD_62u7mXO7iz9SMgL0ryBLF8lv2Q/setWebhook" \
  -d "url=https://line-crm-worker.line-crm-api.workers.dev/telegram/webhook" \
  | python3 -m json.tool
```
Expected: `"ok": true, "result": true`

- [ ] **Step 3: Webhook登録確認**

```bash
curl -s "https://api.telegram.org/bot8631492499:AAEPSLLD_62u7mXO7iz9SMgL0ryBLF8lv2Q/getWebhookInfo" \
  | python3 -m json.tool | grep -E "url|pending|last_error"
```
Expected: `"url": "https://line-crm-worker.line-crm-api.workers.dev/telegram/webhook"`

- [ ] **Step 4: コミット**

```bash
git add apps/worker/wrangler.toml
git commit -m "feat: Telegram CS Bot デプロイ完了"
```

---

## Task 9: 動作確認

- [ ] **Step 1: バリリンガルのLINEにテストメッセージを送る**

「英語コースの料金を教えてください」と送信。

- [ ] **Step 2: Telegramに通知が届くか確認**

30秒以内にTelegramのbarilingual_cs_botからメッセージが届くこと。
ドラフトとボタン（承認/修正指示/スキップ）が表示されること。

- [ ] **Step 3: 承認フローを確認**

「✅ 承認して送信」ボタンを押す。
LINEに返信が届くこと。
Telegramのメッセージが「✅ LINE送信完了」に変わること。

- [ ] **Step 4: 修正指示フローを確認**

もう1件LINEメッセージを送る。
「✏️ 修正指示」ボタンを押す。
「もっと柔らかく」と返信する。
再生成されたドラフトが通知されること。

- [ ] **Step 5: D1でデータ確認**

```bash
npx wrangler d1 execute line-crm --remote \
  --command "SELECT id, status, telegram_draft FROM os_inquiry_log ORDER BY created_at DESC LIMIT 3" \
  2>&1 | grep -E '"id"|"status"|"telegram_draft"' | head -20
```
Expected: `status = 'replied'` のレコードが存在する

```bash
npx wrangler d1 execute line-crm --remote \
  --command "SELECT correction_type, instruction, final_draft FROM inquiry_correction_log ORDER BY created_at DESC LIMIT 3" \
  2>&1 | grep -E '"correction_type"|"instruction"|"final_draft"' | head -20
```
Expected: `correction_type = 'approved'` のレコードが存在する
