/**
 * Discord Interactions endpoint
 * ボタンクリック・モーダル送信を処理する
 */

import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import { generateDraftWithGroq } from '../services/groq-draft.js';
import { notifyDiscord } from '../services/discord-notify.js';
import type { Env } from '../index.js';

export const discordInteractions = new Hono<Env>();

// --- ed25519 署名検証 ---
async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const keyBytes = hexToBytes(publicKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const sigBytes = hexToBytes(signature);
    const msgBytes = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, msgBytes);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// --- メインルート ---
discordInteractions.post('/discord/interactions', async (c) => {
  const signature = c.req.header('x-signature-ed25519') ?? '';
  const timestamp = c.req.header('x-signature-timestamp') ?? '';
  const rawBody = await c.req.text();

  const valid = await verifyDiscordSignature(
    c.env.DISCORD_APP_PUBLIC_KEY ?? '',
    signature,
    timestamp,
    rawBody,
  );
  if (!valid) {
    return c.text('Unauthorized', 401);
  }

  const body = JSON.parse(rawBody) as {
    type: number;
    id: string;
    token: string;
    application_id: string;
    channel_id: string;
    message?: { id: string; embeds?: any[] };
    data?: {
      custom_id?: string;
      components?: { components: { custom_id: string; value: string }[] }[];
    };
  };

  // PING
  if (body.type === 1) {
    return c.json({ type: 1 });
  }

  const db = c.env.DB;
  const customId = body.data?.custom_id ?? '';

  // --- ボタン処理 (type: 3 = MESSAGE_COMPONENT) ---
  if (body.type === 3) {
    // approve_<id> — 承認ボタン
    if (customId.startsWith('approve_')) {
      const queueId = customId.replace('approve_', '');
      const row = await db
        .prepare("SELECT * FROM inquiry_queue WHERE id = ? AND status = 'pending'")
        .bind(queueId)
        .first<any>();

      if (!row) {
        return c.json({ type: 4, data: { content: '既に処理済みか、見つかりません。', flags: 64 } });
      }

      // LINE送信
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(row.line_user_id, [{ type: 'text', text: row.draft }]);

      // D1更新
      await db
        .prepare("UPDATE inquiry_queue SET status = 'sent', final_reply = ?, sent_at = datetime('now') WHERE id = ?")
        .bind(row.draft, queueId)
        .run();

      // 修正ログ記録
      await db
        .prepare(
          'INSERT INTO inquiry_correction_log (inquiry_id, correction_type, original_draft, final_draft) VALUES (?, ?, ?, ?)',
        )
        .bind(queueId, 'approved', row.draft, row.draft)
        .run();

      // Discordメッセージ更新（ボタン除去+送信済み表示）
      const msgId = body.message?.id;
      if (msgId && c.env.DISCORD_BOT_TOKEN) {
        const originalEmbeds = body.message?.embeds ?? [];
        originalEmbeds.push({
          color: 0x22c55e,
          description: '✅ LINE送信完了',
          timestamp: new Date().toISOString(),
        });
        await fetch(
          `https://discord.com/api/v10/channels/${body.channel_id}/messages/${msgId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${c.env.DISCORD_BOT_TOKEN}`,
            },
            body: JSON.stringify({ embeds: originalEmbeds, components: [] }),
          },
        );
      }

      return c.json({ type: 7, data: {} });
    }

    // edit_<id> — 修正モーダル表示
    if (customId.startsWith('edit_')) {
      const queueId = customId.replace('edit_', '');
      const row = await db
        .prepare('SELECT draft FROM inquiry_queue WHERE id = ?')
        .bind(queueId)
        .first<{ draft: string }>();

      return c.json({
        type: 9, // MODAL
        data: {
          custom_id: `edit_submit_${queueId}`,
          title: '返信を修正',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'edited_reply',
                  label: '修正後の返信文',
                  style: 2,
                  value: row?.draft ?? '',
                  required: true,
                },
              ],
            },
          ],
        },
      });
    }

    // regen_<id> — 再生成プロンプト入力モーダル
    if (customId.startsWith('regen_')) {
      const queueId = customId.replace('regen_', '');
      return c.json({
        type: 9,
        data: {
          custom_id: `regen_submit_${queueId}`,
          title: '再生成の指示',
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'regen_prompt',
                  label: '修正指示（例: もっとカジュアルに）',
                  style: 2,
                  placeholder: '修正したいポイントを書いてください',
                  required: true,
                },
              ],
            },
          ],
        },
      });
    }
  }

  // --- モーダル送信処理 (type: 5 = MODAL_SUBMIT) ---
  if (body.type === 5) {
    const getValue = (id: string): string => {
      for (const row of body.data?.components ?? []) {
        for (const comp of row.components) {
          if (comp.custom_id === id) return comp.value;
        }
      }
      return '';
    };

    // edit_submit_<id> — 修正テキストでLINE送信
    if (customId.startsWith('edit_submit_')) {
      const queueId = customId.replace('edit_submit_', '');
      const editedText = getValue('edited_reply');

      const row = await db
        .prepare('SELECT * FROM inquiry_queue WHERE id = ?')
        .bind(queueId)
        .first<any>();

      if (!row) {
        return c.json({ type: 4, data: { content: '見つかりません。', flags: 64 } });
      }

      // LINE送信
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      await lineClient.pushMessage(row.line_user_id, [{ type: 'text', text: editedText }]);

      // D1更新
      await db
        .prepare("UPDATE inquiry_queue SET status = 'sent', final_reply = ?, sent_at = datetime('now') WHERE id = ?")
        .bind(editedText, queueId)
        .run();

      // 修正ログ
      await db
        .prepare(
          'INSERT INTO inquiry_correction_log (inquiry_id, correction_type, instruction, original_draft, final_draft) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(queueId, 'manual_edit', editedText, row.draft, editedText)
        .run();

      return c.json({ type: 4, data: { content: '✅ 修正版をLINE送信しました。', flags: 64 } });
    }

    // regen_submit_<id> — 再生成してDiscordに新メッセージ
    if (customId.startsWith('regen_submit_')) {
      const queueId = customId.replace('regen_submit_', '');
      const regenPrompt = getValue('regen_prompt');

      const row = await db
        .prepare('SELECT * FROM inquiry_queue WHERE id = ?')
        .bind(queueId)
        .first<any>();

      if (!row) {
        return c.json({ type: 4, data: { content: '見つかりません。', flags: 64 } });
      }

      // Groqで再生成
      const newDraft = await generateDraftWithGroq({
        systemPrompt: `あなたはバリリンガル（バリ島の英語留学学校）のLINE返信担当です。
元のドラフトに対してユーザーから修正指示がありました。指示に従って返信を再生成してください。

## 元の問い合わせ
${row.message}

## 元のドラフト
${row.draft}`,
        userPrompt: `修正指示: ${regenPrompt}\n\n上記の指示に従って返信を再生成してください。`,
        groqApiKey: c.env.GROQ_API_KEY ?? '',
      });

      if (!newDraft) {
        return c.json({ type: 4, data: { content: '再生成に失敗しました。', flags: 64 } });
      }

      // D1更新
      await db.prepare('UPDATE inquiry_queue SET draft = ? WHERE id = ?').bind(newDraft, queueId).run();

      // 修正ログ
      await db
        .prepare(
          'INSERT INTO inquiry_correction_log (inquiry_id, correction_type, instruction, original_draft, final_draft) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(queueId, 'regen', regenPrompt, row.draft, newDraft)
        .run();

      // Discordに新ボタン付きメッセージ送信
      if (c.env.DISCORD_BOT_TOKEN && c.env.DISCORD_CHANNEL_ID) {
        await notifyDiscord(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_CHANNEL_ID, {
          username: row.username,
          message: `🔄 再生成（指示: ${regenPrompt}）\n\n元メッセージ: ${row.message}`,
          module: row.module,
          confidence: row.confidence,
          draft: newDraft,
          inquiryId: String(row.id),
          draftSource: 'groq',
        });
      }

      return c.json({ type: 4, data: { content: '🔄 再生成しました。新しいドラフトを確認してください。', flags: 64 } });
    }
  }

  return c.json({ type: 1 });
});
