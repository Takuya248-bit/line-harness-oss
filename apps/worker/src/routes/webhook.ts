import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage, PostbackEvent } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  getLineAccounts,
  getFriendTags,
  addTagToFriend,
  jstNow,
  getActiveFriendSurvey,
  getSurveyQuestions,
  getSurveyChoices,
  getSurveyById,
  advanceFriendSurvey,
  completeFriendSurvey as completeFriendSurveyDb,
  startFriendSurvey,
  calculateSurveyScore,
  getScoreTagId,
  createBooking,
  getBookingById,
  cancelBooking,
  updateBookingGoogleEventId,
  recordActions,
  recordActionDate,
} from '@line-crm/db';
import type { SurveyChoice } from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import { buildSurveyQuestionFlex } from '../services/survey-flex.js';
import { getAccessToken, getAvailableSlots, createCalendarEvent, deleteCalendarEvent } from '../services/google-calendar-sa.js';
import { buildDateSelectionFlex, buildAvailableSlotsFlex, buildBookingConfirmFlex, buildBookingCancelledFlex } from '../services/booking-flex.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Line-Signature') ?? '';
  const db = c.env.DB;

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  // Multi-account: resolve credentials from DB by destination (channel user ID)
  // or fall back to environment variables (default account)
  let channelSecret = c.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if ((body as { destination?: string }).destination) {
    const accounts = await getLineAccounts(db);
    for (const account of accounts) {
      if (!account.is_active) continue;
      const isValid = await verifySignature(account.channel_secret, rawBody, signature);
      if (isValid) {
        channelSecret = account.channel_secret;
        channelAccessToken = account.channel_access_token;
        matchedAccountId = account.id;
        break;
      }
    }
  }

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, channelAccessToken, matchedAccountId, c.env.WORKER_URL || new URL(c.req.url).origin, c.env);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  lineAccountId: string | null = null,
  workerUrl?: string,
  env?: Env['Bindings'],
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // Set line_account_id for multi-account tracking
    if (lineAccountId) {
      await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
        .bind(lineAccountId, friend.id).run();
    }

    // AB振り分け: 友だち追加時にランダムでAB_A or AB_Bタグを付与
    try {
      const existingTags = await getFriendTags(db, friend.id);
      const hasABTag = existingTags.some((t) => t.name === 'AB_A' || t.name === 'AB_B');
      if (!hasABTag) {
        const abTagName = Math.random() < 0.5 ? 'AB_A' : 'AB_B';
        // タグがなければ自動作成（name UNIQUE制約あり）
        let abTag = await db
          .prepare(`SELECT id FROM tags WHERE name = ?`)
          .bind(abTagName)
          .first<{ id: string }>();
        if (!abTag) {
          const tagId = crypto.randomUUID();
          const now = jstNow();
          await db
            .prepare(`INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)`)
            .bind(tagId, abTagName, abTagName === 'AB_A' ? '#3B82F6' : '#F59E0B', now)
            .run();
          abTag = { id: tagId };
        }
        await addTagToFriend(db, friend.id, abTag.id);
        console.log(`AB assignment: ${userId} → ${abTagName}`);
      }
    } catch (err) {
      console.error('AB tag assignment failed:', err);
    }

    // アクション日時・回数を記録
    try {
      await recordActions(db, friend.id, [
        { type: 'date', key: '友だち登録日' },
        { type: 'count', key: '友だち登録' },
      ]);
    } catch (err) {
      console.error('Failed to record follow action:', err);
    }

    // friend_add シナリオに登録（このアカウントのシナリオのみ）
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // Only trigger scenarios belonging to this account (or unassigned for backward compat)
      const scenarioAccountMatch = !scenario.line_account_id || !lineAccountId || scenario.line_account_id === lineAccountId;
      if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now via replyMessage (free)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const expandedContent = expandVariables(firstStep.message_content, friend as { id: string; display_name: string | null; user_id: string | null });
                const message = buildMessage(firstStep.message_type, expandedContent);
                await lineClient.replyMessage(event.replyToken, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message (replyMessage = 無料)
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, 'reply', ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  // Enforce 9:00-21:00 JST delivery window
                  const h = nextDeliveryDate.getUTCHours();
                  if (h < 9 || h >= 21) {
                    if (h >= 21) nextDeliveryDate.setUTCDate(nextDeliveryDate.getUTCDate() + 1);
                    nextDeliveryDate.setUTCHours(9, 0, 0, 0);
                  }
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken, lineAccountId);
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    let friend = await getFriendByLineUserId(db, userId);
    // 未登録ユーザー（Lstepからの移行等）は自動登録
    if (!friend) {
      let profile;
      try {
        profile = await lineClient.getProfile(userId);
      } catch (err) {
        console.error('Failed to get profile for new message user:', userId, err);
      }
      friend = await upsertFriend(db, {
        lineUserId: userId,
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        statusMessage: profile?.statusMessage ?? null,
      });
      if (lineAccountId) {
        await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ?')
          .bind(lineAccountId, friend.id).run();
      }
      console.log(`Auto-registered friend on message: ${userId} → ${friend.id}`);
    }

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // Survey response via message action (survey:{surveyId}:{questionId}:{choiceId})
    if (incomingText.startsWith('survey:')) {
      const parts = incomingText.split(':');
      if (parts.length === 4) {
        const [, surveyId, questionId, choiceId] = parts;
        console.log('Survey via message:', { surveyId, questionId, choiceId, friendId: friend.id });
        try {
          let friendSurvey = await getActiveFriendSurvey(db, friend.id);
          if (!friendSurvey || friendSurvey.survey_id !== surveyId) {
            friendSurvey = await startFriendSurvey(db, friend.id, surveyId);
          }
          const choicesForQuestion = await getSurveyChoices(db, questionId);
          const selectedChoice = choicesForQuestion.find((c: SurveyChoice) => c.id === choiceId);
          if (selectedChoice) {
            if (selectedChoice.metadata_key) {
              const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
              const meta = JSON.parse(existing?.metadata || '{}');
              meta[selectedChoice.metadata_key] = selectedChoice.label;
              await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
                .bind(JSON.stringify(meta), now, friend.id).run();
            }
            if (selectedChoice.tag_id) {
              await addTagToFriend(db, friend.id, selectedChoice.tag_id);
            }
            const answers: Record<string, string> = JSON.parse(friendSurvey.answers || '{}');
            answers[questionId] = selectedChoice.label;
            const allQuestions = await getSurveyQuestions(db, surveyId);
            const currentQuestion = allQuestions.find(q => q.id === questionId);
            if (currentQuestion) {
              const currentOrder = currentQuestion.question_order;
              const nextQuestion = allQuestions.find(q => q.question_order > currentOrder);
              const isFirstQuestion = allQuestions.length > 0 && currentOrder === allQuestions[0].question_order;
              if (isFirstQuestion) {
                try { await recordActionDate(db, friend.id, 'アンケート回答開始日時'); } catch {}
              }
              if (nextQuestion) {
                await advanceFriendSurvey(db, friendSurvey.id, nextQuestion.question_order, answers);
                const nextChoices = await getSurveyChoices(db, nextQuestion.id);
                const flexBubble = buildSurveyQuestionFlex(surveyId, nextQuestion, nextChoices);
                await lineClient.pushMessage(userId, [buildMessage('flex', JSON.stringify(flexBubble))]);
              } else {
                await completeFriendSurveyDb(db, friendSurvey.id, answers);
                try { await recordActionDate(db, friend.id, 'アンケート完了日時'); } catch {}
                const survey = await getSurveyById(db, surveyId);
                if (survey?.on_complete_tag_id) {
                  await addTagToFriend(db, friend.id, survey.on_complete_tag_id);
                }
                if (survey?.on_complete_scenario_id) {
                  await enrollFriendInScenario(db, friend.id, survey.on_complete_scenario_id);
                }
                // Fire tag_added event for on_complete_tag
                if (survey?.on_complete_tag_id) {
                  await fireEvent(db, 'tag_added', { friendId: friend.id, tagId: survey.on_complete_tag_id }, lineAccessToken, lineAccountId);
                }
                const completionFlex = {
                  type: 'bubble',
                  body: { type: 'box', layout: 'vertical', contents: [
                    { type: 'text', text: 'ありがとうございました!', weight: 'bold', size: 'lg', color: '#F59E0B', align: 'center' },
                    { type: 'text', text: '回答を受け付けました。', size: 'sm', color: '#64748b', align: 'center', margin: 'md', wrap: true },
                  ], paddingAll: '20px' },
                };
                await lineClient.pushMessage(userId, [buildMessage('flex', JSON.stringify(completionFlex))]);
              }
            }
          }
        } catch (err) {
          console.error('Failed to process survey via message:', err);
        }
      }
      return;
    }

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（ユーザーの自発的メッセージのみ unread にする）
    // ボタンタップ等の自動応答キーワードは除外
    const autoKeywords = ['料金', '機能', 'API', 'フォーム', 'ヘルプ', 'UUID', 'UUID連携について教えて', 'UUID連携を確認', '配信時間', '導入支援を希望します', 'アカウント連携を見る', '体験を完了する', 'BAN対策を見る', '連携確認'];
    const isAutoKeyword = autoKeywords.some(k => incomingText === k);
    const isTimeCommand = /(?:配信時間|配信|届けて|通知)[はを]?\s*\d{1,2}\s*時/.test(incomingText);
    if (!isAutoKeyword && !isTimeCommand) {
      await upsertChatOnMessage(db, friend.id);
    }

    // 配信時間設定: 「配信時間は○時」「○時に届けて」等のパターンを検出
    const timeMatch = incomingText.match(/(?:配信時間|配信|届けて|通知)[はを]?\s*(\d{1,2})\s*時/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= 6 && hour <= 22) {
        // Save preferred_hour to friend metadata
        const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
        const meta = JSON.parse(existing?.metadata || '{}');
        meta.preferred_hour = hour;
        await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(meta), jstNow(), friend.id).run();

        // Reply with confirmation
        try {
          const period = hour < 12 ? '午前' : '午後';
          const displayHour = hour <= 12 ? hour : hour - 12;
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: '配信時間を設定しました', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'box', layout: 'vertical', contents: [
                  { type: 'text', text: `${period} ${displayHour}:00`, size: 'xxl', weight: 'bold', color: '#f59e0b', align: 'center' },
                  { type: 'text', text: `（${hour}:00〜）`, size: 'sm', color: '#64748b', align: 'center', margin: 'sm' },
                ], backgroundColor: '#fffbeb', cornerRadius: 'md', paddingAll: '20px', margin: 'lg' },
                { type: 'text', text: '今後のステップ配信はこの時間以降にお届けします。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
              ], paddingAll: '20px' },
            })),
          ]);
        } catch (err) {
          console.error('Failed to reply for time setting', err);
        }
        return;
      }
    }

    // Cross-account trigger: send message from another account via UUID
    if (incomingText === '体験を完了する' && lineAccountId) {
      try {
        const friendRecord = await db.prepare('SELECT user_id FROM friends WHERE id = ?').bind(friend.id).first<{ user_id: string | null }>();
        if (friendRecord?.user_id) {
          // Find the same user on other accounts
          const otherFriends = await db.prepare(
            'SELECT f.line_user_id, la.channel_access_token FROM friends f INNER JOIN line_accounts la ON la.id = f.line_account_id WHERE f.user_id = ? AND f.line_account_id != ? AND f.is_following = 1'
          ).bind(friendRecord.user_id, lineAccountId).all<{ line_user_id: string; channel_access_token: string }>();

          for (const other of otherFriends.results) {
            const otherClient = new LineClient(other.channel_access_token);
            const { buildMessage: bm } = await import('../services/step-delivery.js');
            await otherClient.pushMessage(other.line_user_id, [bm('flex', JSON.stringify({
              type: 'bubble', size: 'giga',
              header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#fffbeb',
                contents: [{ type: 'text', text: `${friend.display_name || ''}さんへ`, size: 'lg', weight: 'bold', color: '#1e293b' }],
              },
              body: { type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'text', text: '別アカウントからのアクションを検知しました。', size: 'sm', color: '#06C755', weight: 'bold', wrap: true },
                  { type: 'text', text: 'アカウント連携が正常に動作しています。体験ありがとうございました。', size: 'sm', color: '#1e293b', wrap: true, margin: 'md' },
                  { type: 'separator', margin: 'lg' },
                  { type: 'text', text: 'ステップ配信・フォーム即返信・アカウント連携・リッチメニュー・自動返信 — 全て無料、全てOSS。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
                ],
              },
              footer: { type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [
                  { type: 'button', action: { type: 'message', label: '導入について相談する', text: '導入支援を希望します' }, style: 'primary', color: '#06C755' },
                  { type: 'button', action: { type: 'uri', label: 'フィードバックを送る', uri: 'https://liff.line.me/2009554425-4IMBmLQ9?page=form&id=0c81910a-fe27-41a7-bf8c-1411a9240155' }, style: 'secondary', margin: 'sm' },
                ],
              },
            }))]);
          }

          // Reply on Account ② confirming
          await lineClient.replyMessage(event.replyToken, [buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'text', text: 'Account ① にメッセージを送りました', size: 'sm', color: '#06C755', weight: 'bold', align: 'center' },
                { type: 'text', text: 'Account ① のトーク画面を確認してください', size: 'xs', color: '#64748b', align: 'center', margin: 'md' },
              ],
            },
          }))]);
          return;
        }
      } catch (err) {
        console.error('Cross-account trigger error:', err);
      }
    }

    // 自動返信チェック: auto_replies テーブル + automations テーブル両方を参照
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event

    // 1. auto_replies テーブル（レガシー）
    const autoReplyQuery = `SELECT * FROM auto_replies WHERE is_active = 1 ORDER BY created_at ASC`;
    const autoReplies = await db.prepare(autoReplyQuery)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains' | 'range_number' | 'range_date';
        response_type: string;
        response_content: string;
        range_min: string | null;
        range_max: string | null;
        is_active: number;
        created_at: string;
      }>();

    // 2. automations テーブル（新: /api/automations で作成されたルール）
    const automationsQuery = `SELECT * FROM automations WHERE is_active = 1 AND event_type = 'message_received' ORDER BY priority DESC, created_at ASC`;
    const automationsResult = await db.prepare(automationsQuery)
      .all<{
        id: string;
        name: string;
        conditions: string;
        actions: string;
        is_active: number;
        priority: number;
        created_at: string;
      }>();

    let matched = false;

    // Check auto_replies first
    for (const rule of autoReplies.results) {
      let isMatch = false;

      if (rule.match_type === 'exact') {
        isMatch = incomingText === rule.keyword;
      } else if (rule.match_type === 'contains') {
        isMatch = incomingText.includes(rule.keyword);
      } else if (rule.match_type === 'range_number') {
        const num = parseFloat(incomingText.replace(/[,、]/g, '').trim());
        if (!isNaN(num) && rule.range_min !== null && rule.range_max !== null) {
          isMatch = num >= parseFloat(rule.range_min) && num <= parseFloat(rule.range_max);
        }
      } else if (rule.match_type === 'range_date') {
        // Parse incoming text as date (supports YYYY-MM-DD, YYYY/MM/DD, MM/DD, etc.)
        const normalized = incomingText.trim().replace(/\//g, '-');
        const parsed = new Date(normalized);
        if (!isNaN(parsed.getTime()) && rule.range_min !== null && rule.range_max !== null) {
          const minDate = new Date(rule.range_min);
          const maxDate = new Date(rule.range_max);
          if (!isNaN(minDate.getTime()) && !isNaN(maxDate.getTime())) {
            isMatch = parsed >= minDate && parsed <= maxDate;
          }
        }
      }

      if (isMatch) {
        try {
          const expandedContent = expandVariables(rule.response_content, friend as { id: string; display_name: string | null; user_id: string | null }, workerUrl);
          const replyMsg = buildMessage(rule.response_type, expandedContent);
          await lineClient.replyMessage(event.replyToken, [replyMsg]);

          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'reply', ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }
        matched = true;
        break;
      }
    }

    // Check automations table if no match in auto_replies
    if (!matched) {
      for (const automation of automationsResult.results) {
        try {
          const conditions = JSON.parse(automation.conditions);
          const actions = JSON.parse(automation.actions);

          if (!conditions.keyword) continue;

          const isMatch =
            conditions.matchType === 'exact'
              ? incomingText === conditions.keyword
              : incomingText.includes(conditions.keyword);

          if (isMatch) {
            for (const action of actions) {
              if (action.type === 'reply') {
                const expandedContent = expandVariables(action.content, friend as { id: string; display_name: string | null; user_id: string | null }, workerUrl);
                const replyMsg = buildMessage(action.messageType || 'text', expandedContent);
                // Try replyMessage first, fall back to pushMessage if replyToken expired
                try {
                  await lineClient.replyMessage(event.replyToken, [replyMsg]);
                } catch (replyErr) {
                  console.error('replyMessage failed, trying pushMessage:', replyErr);
                  await lineClient.pushMessage(event.source.userId!, [replyMsg]);
                }

                const outLogId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'reply', ?)`,
                  )
                  .bind(outLogId, friend.id, action.messageType || 'text', action.content, jstNow())
                  .run();
              } else if (action.type === 'add_tag' && action.tagId && action.tagId !== 'UNKNOWN') {
                // phase_*タグの排他制御: 新フェーズ付与時に旧フェーズを自動除去
                const tagRow = await db.prepare('SELECT name FROM tags WHERE id = ?').bind(action.tagId).first<{name: string}>();
                if (tagRow?.name?.startsWith('phase_')) {
                  await db
                    .prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id IN (
                      SELECT id FROM tags WHERE name LIKE 'phase_%' AND id != ?
                    )`)
                    .bind(friend.id, action.tagId)
                    .run();
                }
                await db
                  .prepare(`INSERT OR IGNORE INTO friend_tags (id, friend_id, tag_id, created_at) VALUES (?, ?, ?, ?)`)
                  .bind(crypto.randomUUID(), friend.id, action.tagId, jstNow())
                  .run();
              }
            }
            matched = true;
            break;
          }
        } catch (err) {
          console.error('Failed to process automation rule', err);
        }
      }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken, lineAccountId);

    return;
  }

  // Postback handler (survey responses etc.)
  if (event.type === 'postback') {
    const postbackEvent = event as PostbackEvent;
    const postbackData = postbackEvent.postback.data;
    console.log('Postback received:', postbackData);

    // Survey postback: survey:{surveyId}:{questionId}:{choiceId}
    if (postbackData.startsWith('survey:')) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) { console.log('Survey postback: no userId'); return; }

      let friend = await getFriendByLineUserId(db, userId);
      if (!friend) {
        // Auto-register on postback (e.g. migrated from Lstep)
        let profile;
        try { profile = await lineClient.getProfile(userId); } catch {}
        friend = await upsertFriend(db, {
          lineUserId: userId,
          displayName: profile?.displayName ?? null,
          pictureUrl: profile?.pictureUrl ?? null,
          statusMessage: profile?.statusMessage ?? null,
        });
        if (lineAccountId) {
          await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ?')
            .bind(lineAccountId, friend.id).run();
        }
        console.log('Auto-registered friend on postback:', userId);
      }
      console.log('Survey postback friend:', friend.id, 'userId:', userId);

      const parts = postbackData.split(':');
      if (parts.length !== 4) { console.log('Survey postback: invalid parts count', parts.length); return; }
      const [, surveyId, questionId, choiceId] = parts;
      console.log('Survey postback parsed:', { surveyId, questionId, choiceId });

      try {
        // Get active friend survey
        let friendSurvey = await getActiveFriendSurvey(db, friend.id);
        if (!friendSurvey || friendSurvey.survey_id !== surveyId) {
          // Start a new one if not active for this survey
          friendSurvey = await startFriendSurvey(db, friend.id, surveyId);
        }

        // Get the selected choice
        const choicesForQuestion = await getSurveyChoices(db, questionId);
        const selectedChoice = choicesForQuestion.find((c: SurveyChoice) => c.id === choiceId);
        if (!selectedChoice) return;

        // Save metadata if metadata_key exists
        if (selectedChoice.metadata_key) {
          const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
          const meta = JSON.parse(existing?.metadata || '{}');
          meta[selectedChoice.metadata_key] = selectedChoice.label;
          await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
            .bind(JSON.stringify(meta), jstNow(), friend.id).run();
        }

        // Add tag if tag_id exists
        if (selectedChoice.tag_id) {
          await addTagToFriend(db, friend.id, selectedChoice.tag_id);
        }

        // Update answers
        const answers: Record<string, string> = JSON.parse(friendSurvey.answers || '{}');
        answers[questionId] = selectedChoice.label;

        // Get all questions to determine next
        const allQuestions = await getSurveyQuestions(db, surveyId);
        const currentQuestion = allQuestions.find(q => q.id === questionId);
        if (!currentQuestion) return;

        const currentOrder = currentQuestion.question_order;
        const nextQuestion = allQuestions.find(q => q.question_order > currentOrder);

        // アクション日時記録: 最初の質問回答時
        const isFirstQuestion = allQuestions.length > 0 && currentOrder === allQuestions[0].question_order;
        if (isFirstQuestion) {
          try {
            await recordActionDate(db, friend.id, 'アンケート回答開始日時');
          } catch (err) {
            console.error('Failed to record survey start action:', err);
          }
        }

        if (nextQuestion) {
          // Advance to next question
          await advanceFriendSurvey(db, friendSurvey.id, nextQuestion.question_order, answers);

          const nextChoices = await getSurveyChoices(db, nextQuestion.id);
          const flexBubble = buildSurveyQuestionFlex(surveyId, nextQuestion, nextChoices);

          try {
            await lineClient.replyMessage(postbackEvent.replyToken, [
              buildMessage('flex', JSON.stringify(flexBubble)),
            ]);
          } catch {
            // replyToken may have expired, try pushMessage
            await lineClient.pushMessage(userId, [
              buildMessage('flex', JSON.stringify(flexBubble)),
            ]);
          }
        } else {
          // Last question - complete the survey
          await completeFriendSurveyDb(db, friendSurvey.id, answers);

          // アクション日時記録: アンケート完了
          try {
            await recordActionDate(db, friend.id, 'アンケート完了日時');
          } catch (err) {
            console.error('Failed to record survey complete action:', err);
          }

          // Apply on_complete_tag_id
          const survey = await getSurveyById(db, surveyId);
          if (survey?.on_complete_tag_id) {
            await addTagToFriend(db, friend.id, survey.on_complete_tag_id);
          }

          // Score-based tag assignment
          if (survey?.score_tag_rules) {
            const totalScore = await calculateSurveyScore(db, surveyId, answers);
            const scoreTagId = getScoreTagId(survey.score_tag_rules, totalScore);
            if (scoreTagId) {
              await addTagToFriend(db, friend.id, scoreTagId);
            }
            // Store score in friend metadata for later use
            const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
            const meta = JSON.parse(existing?.metadata || '{}');
            meta[`survey_score_${surveyId}`] = totalScore;
            await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
              .bind(JSON.stringify(meta), jstNow(), friend.id).run();
          }

          // Start on_complete_scenario_id
          if (survey?.on_complete_scenario_id) {
            await enrollFriendInScenario(db, friend.id, survey.on_complete_scenario_id);

            // Send first step of the scenario
            const steps = await getScenarioSteps(db, survey.on_complete_scenario_id);
            if (steps.length > 0) {
              const firstStep = steps[0];
              const expandedContent = expandVariables(firstStep.message_content, friend as { id: string; display_name: string | null; user_id: string | null });
              const message = buildMessage(firstStep.message_type, expandedContent);
              try {
                await lineClient.pushMessage(userId, [message]);
              } catch (err) {
                console.error('Failed to send scenario first step after survey completion', err);
              }
            }
          }

          // Send completion message (with score if available)
          try {
            let completionFlex;
            if (survey?.score_tag_rules) {
              const totalScore = await calculateSurveyScore(db, surveyId, answers);
              const questionCount = allQuestions.length;
              completionFlex = buildScoreResultFlex(totalScore, questionCount);
            } else {
              completionFlex = {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: 'ありがとうございました!', weight: 'bold', size: 'lg', color: '#F59E0B', align: 'center' },
                    { type: 'text', text: '回答を受け付けました。', size: 'sm', color: '#64748b', align: 'center', margin: 'md', wrap: true },
                  ],
                  paddingAll: '20px',
                },
              };
            }
            await lineClient.replyMessage(postbackEvent.replyToken, [
              buildMessage('flex', JSON.stringify(completionFlex)),
            ]);
          } catch {
            // replyToken may have expired — completion message is optional
          }
        }
      } catch (err) {
        console.error('Failed to process survey postback', err);
      }
    }

    // Booking postback: booking_start
    if (postbackData === 'booking_start') {
      try {
        const flex = buildDateSelectionFlex();
        await lineClient.replyMessage(postbackEvent.replyToken, [
          buildMessage('flex', JSON.stringify(flex)),
        ]);
      } catch (err) {
        console.error('Failed to send booking date selection', err);
      }
    }

    // Booking date selection: booking_date:{date}
    if (postbackData.startsWith('booking_date:')) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) return;

      const date = postbackData.split(':')[1];
      if (!date) return;

      try {
        if (env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_SERVICE_ACCOUNT_KEY && env?.GOOGLE_CALENDAR_ID) {
          const accessToken = await getAccessToken({
            GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
            GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
          });
          const slots = await getAvailableSlots(accessToken, env.GOOGLE_CALENDAR_ID, date, 14, 21, 60);
          const flex = buildAvailableSlotsFlex(date, slots);
          try {
            await lineClient.replyMessage(postbackEvent.replyToken, [
              buildMessage('flex', JSON.stringify(flex)),
            ]);
          } catch {
            await lineClient.pushMessage(userId, [
              buildMessage('flex', JSON.stringify(flex)),
            ]);
          }
        } else {
          await lineClient.replyMessage(postbackEvent.replyToken, [
            buildMessage('text', '予約機能は現在準備中です。'),
          ]);
        }
      } catch (err) {
        console.error('Failed to send available slots', err);
      }
    }

    // Booking slot selection: booking:{date}:{time}
    if (postbackData.startsWith('booking:') && !postbackData.startsWith('booking_')) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) return;

      const parts = postbackData.split(':');
      if (parts.length !== 3) return;
      const [, date, startTime] = parts;

      try {
        const friend = await getFriendByLineUserId(db, userId);
        if (!friend) return;

        // Calculate end time (60 min)
        const startHour = parseInt(startTime.split(':')[0], 10);
        const startMin = parseInt(startTime.split(':')[1], 10);
        const endHour = startHour + 1;
        const endTime = `${String(endHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

        const startISO = `${date}T${startTime}:00+09:00`;
        const endISO = `${date}T${endTime}:00+09:00`;

        // Create Google Calendar event
        let googleEventId: string | undefined;
        if (env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_SERVICE_ACCOUNT_KEY && env?.GOOGLE_CALENDAR_ID) {
          try {
            const accessToken = await getAccessToken({
              GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
              GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
              GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
            });
            const result = await createCalendarEvent(accessToken, env.GOOGLE_CALENDAR_ID, {
              summary: `オンライン面談 - ${friend.display_name ?? 'LINE友だち'}`,
              start: startISO,
              end: endISO,
              description: `LINE予約 (${friend.display_name ?? userId})`,
            });
            googleEventId = result.id;
          } catch (err) {
            console.warn('Google Calendar event creation failed (booking still saved):', err);
          }
        }

        // Save booking to DB
        const booking = await createBooking(db, {
          friendId: friend.id,
          lineAccountId: lineAccountId ?? undefined,
          title: 'オンライン面談',
          startTime: startISO,
          endTime: endISO,
          googleEventId,
        });

        if (googleEventId) {
          await updateBookingGoogleEventId(db, booking.id, googleEventId);
        }

        // アクション日時・回数を記録: カウンセリング予約
        try {
          await recordActions(db, friend.id, [
            { type: 'date', key: 'カウンセリング予約完了日時' },
            { type: 'count', key: 'カウンセリング予約' },
          ]);
        } catch (err) {
          console.error('Failed to record booking action:', err);
        }

        // Send confirmation
        const flex = buildBookingConfirmFlex(booking.id, date, startTime, endTime);
        try {
          await lineClient.replyMessage(postbackEvent.replyToken, [
            buildMessage('flex', JSON.stringify(flex)),
          ]);
        } catch {
          await lineClient.pushMessage(userId, [
            buildMessage('flex', JSON.stringify(flex)),
          ]);
        }
      } catch (err) {
        console.error('Failed to process booking', err);
      }
    }

    // Booking cancel: booking_cancel:{bookingId}
    if (postbackData.startsWith('booking_cancel:')) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) return;

      const bookingId = postbackData.split(':')[1];
      if (!bookingId) return;

      try {
        const booking = await getBookingById(db, bookingId);
        if (!booking) return;

        // Delete from Google Calendar
        if (booking.google_event_id && env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_SERVICE_ACCOUNT_KEY && env?.GOOGLE_CALENDAR_ID) {
          try {
            const accessToken = await getAccessToken({
              GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
              GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
              GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
            });
            await deleteCalendarEvent(accessToken, env.GOOGLE_CALENDAR_ID, booking.google_event_id);
          } catch (err) {
            console.warn('Google Calendar event deletion failed:', err);
          }
        }

        await cancelBooking(db, bookingId);

        // アクション日時記録: キャンセル
        try {
          const friend = await getFriendByLineUserId(db, userId);
          if (friend) {
            await recordActionDate(db, friend.id, 'カウンセリングキャンセル日時');
          }
        } catch (err) {
          console.error('Failed to record booking cancel action:', err);
        }

        const flex = buildBookingCancelledFlex();
        try {
          await lineClient.replyMessage(postbackEvent.replyToken, [
            buildMessage('flex', JSON.stringify(flex)),
          ]);
        } catch {
          await lineClient.pushMessage(userId, [
            buildMessage('flex', JSON.stringify(flex)),
          ]);
        }
      } catch (err) {
        console.error('Failed to cancel booking', err);
      }
    }

    return;
  }
}

// スコア診断結果のFlexメッセージ
function buildScoreResultFlex(score: number, maxScore: number) {
  let level: string;
  let comment: string;
  let color: string;
  if (score <= Math.floor(maxScore * 0.3)) {
    level = '初級';
    comment = 'もったいない！基本設定だけで反応が変わります';
    color = '#EF4444';
  } else if (score <= Math.floor(maxScore * 0.6)) {
    level = '中級';
    comment = 'いい感じ！あと少しの工夫で売上に繋がります';
    color = '#F59E0B';
  } else {
    level = '上級';
    comment = 'かなり活用できてます！さらに自動化で効率UP';
    color = '#10B981';
  }

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '診断結果', weight: 'bold', size: 'sm', color: '#64748b', align: 'center' },
        { type: 'text', text: `${score} / ${maxScore} 点`, weight: 'bold', size: 'xxl', color, align: 'center', margin: 'md' },
        { type: 'text', text: `レベル: ${level}`, weight: 'bold', size: 'md', color, align: 'center', margin: 'sm' },
        { type: 'separator', margin: 'lg' },
        { type: 'text', text: comment, size: 'sm', color: '#334155', align: 'center', margin: 'lg', wrap: true },
      ],
      paddingAll: '20px',
    },
  };
}

export { webhook };
