/**
 * os-intake.ts - Lステップからのwebhook受信エンドポイント
 *
 * Lステップのアクション「Webhook送信」から呼ばれる。
 * LINE Webhook URLは触らず、Lステップが自発的にOSに通知する形式。
 */

import { Hono } from 'hono';
import { classify } from '../../../../os/core/classifier.js';
import { tryQuickAnswer, handleInquiry } from '../../../../os/modules/inquiry/handler.js';
import { notifyDiscord } from '../services/discord-notify.js';
import { generateDraftWithGroq } from '../services/groq-draft.js';
import type { Env } from '../index.js';

const osIntake = new Hono<Env>();

/**
 * Lステップ Webhook送信アクションの受信
 *
 * Lステップから送られるデータ形式:
 * {
 *   "name": "友だちの名前",
 *   "message": "メッセージ本文",
 *   "uid": "LINE ユーザーID",
 *   "tags": "タグ1,タグ2",
 *   "phase": "フェーズ名",
 *   ...カスタムフィールド
 * }
 *
 * Lステップの送信データはカスタマイズ可能なので、柔軟に受け取る
 */
osIntake.post('/api/os/intake', async (c) => {
  const db = c.env.DB;
  let payload: Record<string, any>;

  try {
    payload = await c.req.json();
  } catch {
    // form-urlencoded の場合
    try {
      const text = await c.req.text();
      payload = Object.fromEntries(new URLSearchParams(text));
    } catch {
      return c.json({ status: 'error', message: 'Invalid payload' }, 400);
    }
  }

  // Lステップから送られるフィールドを柔軟に取得
  const message = payload.message || payload.text || payload.content || '';
  const name = payload.name || payload.display_name || payload.username || '不明';
  const uid = payload.uid || payload.line_user_id || payload.userId || '';
  const tags = payload.tags || payload.tag || '';
  const phase = payload.phase || payload.fase || '';

  if (!message) {
    return c.json({ status: 'ok', message: 'No message content' }, 200);
  }

  // 1. classify
  const classResult = classify({
    text: message,
    channel: 'line',
    tenant: 'barilingual',
  });

  // 2. D1にログ記録
  try {
    await db.prepare(
      'INSERT INTO os_inquiry_log (line_user_id, message, module, confidence, phase, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      uid,
      message,
      classResult.module,
      classResult.confidence,
      phase || null,
      tags || null,
      'received'
    ).run();
  } catch (err) {
    console.error('OS intake log error:', err);
  }

  // 3. ドラフト生成 (inquiry のみ)
  let draft: string | undefined;
  let draftSource: string | undefined;

  if (classResult.module === 'inquiry') {
    const quickDraft = tryQuickAnswer(message);
    if (quickDraft) {
      draft = quickDraft;
      draftSource = 'template';
    } else if (c.env.GROQ_API_KEY) {
      try {
        // 直近の履歴をD1から取得（uidがあれば）
        let historyText = '';
        if (uid) {
          const history = await db.prepare(
            `SELECT direction, content FROM messages_log
             WHERE friend_id = (SELECT id FROM friends WHERE line_user_id = ? LIMIT 1)
             ORDER BY created_at DESC LIMIT 5`
          ).bind(uid).all();
          historyText = (history.results as any[]).reverse()
            .map((m) => `${m.direction === 'incoming' ? '友だち' : 'こちら'}: ${m.content}`)
            .join('\n');
        }

        const systemPrompt = `あなたはバリリンガル（バリ島の英語留学学校）のLINE返信担当です。

## 料金表
【1人部屋】1週119,800円/2週219,800円/3週289,000円/4週349,800円(人気)/8週629,000円/12週899,000円
【ペア留学】1週98,000円/2週189,000円/4週320,000円/8週539,000円
【外泊】1週85,000円(最安)/2週163,000円/4週246,000円/8週435,000円
※入学金30,000円が別途かかる。料金に含む:授業料・食事(朝昼)・空港送迎・卒業証書

## 授業
1日4コマ(50分×4)、マンツーマン3+グループ1(最大3名)、月〜金9:00-17:00
インドネシア人講師(英語漬け)、初心者OK、卒業生200名以上、場所:バリ島チャングー

## コース
日常英会話/TOEIC対策(3ヶ月で200点UP)/TOEFL対策/英検対策/ワーホリ準備(1-3ヶ月)/サーフィン×英語(4-10月)/ヨガRYT200/副業スキル×英語/親子留学

## 返信ルール
- 親しみやすいが信頼感あり。丁寧語ベース
- 「!」OK、絵文字は最小限
- 押し売りしない。相手の状況を聞き出す→提案
- CTAを1つ含める
- 「スタッフ常駐」と書かない
- 入学金30,000円は別途かかることを必ず伝える`;

        const userPrompt = `## 友だち情報
名前: ${name}
タグ: ${tags || 'なし'}
フェーズ: ${phase || '不明'}

## 直近のやり取り
${historyText || 'なし'}

## 今回のメッセージ
${message}

上記を踏まえて返信ドラフトを作成してください。`;

        const groqDraft = await generateDraftWithGroq({
          systemPrompt,
          userPrompt,
          groqApiKey: c.env.GROQ_API_KEY,
        });
        if (groqDraft) {
          draft = groqDraft;
          draftSource = 'groq';
        }
      } catch (err) {
        console.error('Draft generation error:', err);
      }
    }
  }

  // 4. inquiry_queue保存
  let inquiryQueueId: number | null = null;
  if (draft && uid) {
    try {
      const result = await db.prepare(
        `INSERT INTO inquiry_queue (line_user_id, username, message, draft, module, confidence, phase, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(uid, name, message, draft, classResult.module, classResult.confidence, phase || null, tags || null).run();
      inquiryQueueId = result.meta.last_row_id;
    } catch (err) {
      console.error('inquiry_queue insert error:', err);
    }
  }

  // 5. Discord通知
  if (c.env.DISCORD_BOT_TOKEN && c.env.DISCORD_CHANNEL_ID) {
    try {
      const discordMsgId = await notifyDiscord(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_CHANNEL_ID, {
        username: name,
        message,
        module: classResult.module,
        confidence: classResult.confidence,
        phase: phase || undefined,
        draft,
        inquiryId: inquiryQueueId ? String(inquiryQueueId) : undefined,
        draftSource,
      });
      if (discordMsgId && inquiryQueueId) {
        await db.prepare('UPDATE inquiry_queue SET discord_message_id = ? WHERE id = ?').bind(discordMsgId, inquiryQueueId).run();
      }
    } catch (err) {
      console.error('Discord notify error:', err);
    }
  } else if (c.env.DISCORD_WEBHOOK_URL) {
    // フォールバック（旧Webhook、ボタンなし）
    try {
      await fetch(c.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{ title: '📩 INQUIRY', description: message.slice(0, 200), color: 0x3b82f6,
            fields: [{ name: 'ユーザー', value: name, inline: true }, ...(draft ? [{ name: '💬 ドラフト', value: draft.slice(0, 1000), inline: false }] : [])] }],
        }),
      });
    } catch (err) {
      console.error('Discord webhook fallback error:', err);
    }
  }

  return c.json({
    status: 'ok',
    module: classResult.module,
    confidence: classResult.confidence,
    hasDraft: !!draft,
  });
});

export { osIntake };
