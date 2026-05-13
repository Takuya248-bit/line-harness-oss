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
import { classify } from '../../../../os/core/classifier.js';
import { handleInquiry, tryQuickAnswer } from '../../../../os/modules/inquiry/handler.js';
import { generateDraftWithGroq } from '../services/groq-draft.js';
import { notifyTelegram } from '../services/telegram-notify.js';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import { buildSurveyQuestionFlex } from '../services/survey-flex.js';
import { getAccessToken, getAvailableSlots, createCalendarEvent, deleteCalendarEvent } from '../services/google-calendar-sa.js';
import { buildDateSelectionFlex, buildAvailableSlotsFlex, buildBookingConfirmFlex, buildBookingCancelledFlex } from '../services/booking-flex.js';
import { extractCSKnowledge } from '../services/cs-knowledge-extractor.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();
const BALI_RYUGAKU_CENTER_ACCOUNT_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';
const BALI_RYUGAKU_CENTER_SURVEY_ID = 'c7b163e7-5ed9-4fc3-ab1c-7678cb9b3273';
const BALI_DIAGNOSIS_COMPLETION_TEXT = `診断が完了しました！

ご回答ありがとうございます！😊
あなたのご希望に合わせた最適な留学プランをカウンセラーが選定中です💡

診断結果は、後ほど担当カウンセラーからお送りしますので、お待ちください！

そのほか気になる点などがあれば、メッセージをお送りください。`;

function isBaliRyugakuCenterDiagnosis(lineAccountId: string | null | undefined, surveyId: string): boolean {
  return lineAccountId === BALI_RYUGAKU_CENTER_ACCOUNT_ID && surveyId === BALI_RYUGAKU_CENTER_SURVEY_ID;
}

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

  // Lステップ転送 — 元のペイロードをそのまま転送（シナリオ実行はLステップに委任）
  if (c.env.LSTEP_WEBHOOK_URL) {
    const forwardPromise = forwardToLstep(c.env.LSTEP_WEBHOOK_URL, rawBody, signature);
    c.executionCtx.waitUntil(forwardPromise);
  }

  // バリリンガル/バリ島留学センター（Lステップ管理下）: handleEvent をスキップし、OS処理のみ実行
  // handleEvent はリッチメニュー操作・シナリオ登録等を行うため、Lステップと競合する
  // 注意: matchedAccountId=null（destinationなし or アカウント不一致）は櫻子等の通常運用なので
  // 必ず通常 handleEvent 経路を通すこと (旧ロジックで null も Lstep扱いになっていてTelegram通知漏れ)
  const OS_BARILINGUAL_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
  const BALI_RYUGAKU_CENTER_ID = '3e005b38-0adf-492f-9648-ee09d7c78424';
  const LSTEP_MANAGED_ACCOUNTS = new Set([OS_BARILINGUAL_ID, BALI_RYUGAKU_CENTER_ID]);
  const isLstepManaged = matchedAccountId !== null && LSTEP_MANAGED_ACCOUNTS.has(matchedAccountId);

  if (isLstepManaged) {
    // OS処理のみ（Lステップと競合する handleEvent は実行しない）
    // ただし friends + messages_log への保存は行う（請求書システム等で参照するため）
    const osPromise = (async () => {
      for (const event of body.events) {
        // friend保存（follow/message両方で実行）
        const eventUserId = (event as any).source?.userId;
        if (eventUserId) {
          try {
            let profile;
            try { profile = await lineClient.getProfile(eventUserId); } catch { /* ignore */ }
            const friend = await upsertFriend(db, {
              lineUserId: eventUserId,
              displayName: profile?.displayName ?? null,
              pictureUrl: profile?.pictureUrl ?? null,
              statusMessage: profile?.statusMessage ?? null,
            });
            if (matchedAccountId) {
              await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
                .bind(matchedAccountId, friend.id).run();
            }
            // messages_log保存（テキストメッセージのみ）
            if (event.type === 'message' && (event as any).message?.type === 'text') {
              const msgId = crypto.randomUUID();
              await db.prepare(
                'INSERT OR IGNORE INTO messages_log (id, friend_id, direction, message_type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
              ).bind(msgId, friend.id, 'incoming', 'text', (event as any).message.text, new Date().toISOString()).run();
            }
          } catch (err) {
            console.error('Lstep-managed friend/message save error:', err);
          }
        }

        if (event.type === 'message' && (event as any).message?.type === 'text') {
          const text = (event as any).message.text as string;
          const userId = (event as any).source?.userId ?? 'unknown';
          try {
            const classResult = classify({ text, channel: 'line', tenant: 'barilingual' });
            await db.prepare(
              'INSERT INTO os_inquiry_log (line_user_id, message, module, confidence, status) VALUES (?, ?, ?, ?, ?)'
            ).bind(userId, text, classResult.module, classResult.confidence, 'received').run();

            // ドラフト生成（テンプレート優先→Gemini）
            let draft: string | undefined;
            let draftSource: string | undefined;
            if (classResult.module === 'inquiry') {
              const quickDraft = tryQuickAnswer(text);
              if (quickDraft) {
                draft = quickDraft;
                draftSource = 'テンプレート';
              } else if (c.env.GROQ_API_KEY) {
                try {
                  const friendRow = await db
                    .prepare('SELECT id, display_name FROM friends WHERE line_user_id = ? LIMIT 1')
                    .bind(userId)
                    .first<{ id: string; display_name: string | null }>();
                  const groqDraft = await buildGroqInquiryDraft(db, {
                    message: text,
                    groqApiKey: c.env.GROQ_API_KEY,
                    friendId: friendRow?.id,
                  });
                  if (groqDraft) {
                    draft = groqDraft;
                    draftSource = 'Groq';
                  }
                } catch (err) {
                  console.error('Draft generation error:', err);
                }
              }
            }

            // Telegram通知（inquiry のみ）
            if (
              classResult.module === 'inquiry' &&
              c.env.TELEGRAM_BOT_TOKEN &&
              c.env.TELEGRAM_CHAT_ID
            ) {
              await sendInquiryTelegramNotification(db, c.env, {
                lineUserId: userId,
                message: text,
                draft: draft ?? '（ドラフト生成中）',
              });
            }
          } catch (err) {
            console.error('OS processing error:', err);
          }
        }
      }
    })();
    c.executionCtx.waitUntil(osPromise);
    return c.json({ status: 'ok' }, 200);
  }

  // Lステップ管理外のアカウント: 通常の handleEvent を実行
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

    await syncBaliLineRegistrationFromFollow(db, {
      lineAccountId,
      lineUserId: userId,
      friendId: friend.id,
      metadataSource: 'line_official_webhook',
    });

    // friend_add シナリオに登録（このアカウントのシナリオのみ・厳密一致）
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // アカウント厳密一致のみ。NULL = 全アカウント発火 は廃止 (事故防止)。
      const scenarioAccountMatch = lineAccountId
        ? scenario.line_account_id === lineAccountId
        : !scenario.line_account_id;
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
                // replyToken 期限切れ等で失敗した場合、next_delivery_at=NULL のまま cron に
                // 拾われなくなる。5分後の pushMessage にフォールバックさせる。
                const fallbackDate = new Date(Date.now() + 9 * 60 * 60_000 + 5 * 60_000);
                await advanceFriendScenario(db, friendScenario.id, 0, fallbackDate.toISOString().slice(0, -1) + '+09:00');
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

    // 救済: follow event を取りこぼしていた友達向け。
    // friend_add トリガーの active シナリオに未登録なら enroll する (1回だけ)。
    // これで「LINE webhook 過負荷で follow event ロスト → シナリオ未起動」の被害を後追いで救う。
    try {
      const allScenarios = await getScenarios(db);
      for (const scenario of allScenarios) {
        if (scenario.trigger_type !== 'friend_add' || !scenario.is_active) continue;
        // アカウント厳密一致のみ
        const accountMatch = lineAccountId
          ? scenario.line_account_id === lineAccountId
          : !scenario.line_account_id;
        if (!accountMatch) continue;
        const exists = await db
          .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
          .bind(friend.id, scenario.id)
          .first();
        if (!exists) {
          try {
            await enrollFriendInScenario(db, friend.id, scenario.id);
            console.log(`friend_add scenario rescue enroll: friend=${friend.id} scenario=${scenario.id}`);
          } catch (e) {
            console.error('rescue enroll failed:', e);
          }
        }
      }
    } catch (e) {
      console.error('rescue check error:', e);
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
                await syncBaliDiagnosisCompleteFromSurvey(db, env, {
                  lineAccountId,
                  lineUserId: userId,
                  friendId: friend.id,
                  surveyId,
                  answers,
                });
                if (survey?.on_complete_scenario_id) {
                  await enrollFriendInScenario(db, friend.id, survey.on_complete_scenario_id);
                }
                // Fire tag_added event for on_complete_tag
                if (survey?.on_complete_tag_id) {
                  await fireEvent(db, 'tag_added', { friendId: friend.id, tagId: survey.on_complete_tag_id }, lineAccessToken, lineAccountId);
                }
                if (isBaliRyugakuCenterDiagnosis(lineAccountId, surveyId)) {
                  await lineClient.pushMessage(userId, [buildMessage('text', BALI_DIAGNOSIS_COMPLETION_TEXT)]);
                } else {
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
    // ボタンタップ等の自動応答キーワードは除外。
    // - hardcoded autoKeywords: バリリンガル等のレガシー
    // - automations/auto_replies にマッチするキーワード: 自動応答が走るので通知不要
    //   (このアカウントの自動応答ルールの keyword と incomingText が一致 or 含まれる場合)
    const autoKeywords = ['料金', '機能', 'API', 'フォーム', 'ヘルプ', 'UUID', 'UUID連携について教えて', 'UUID連携を確認', '配信時間', '導入支援を希望します', 'アカウント連携を見る', '体験を完了する', 'BAN対策を見る', '連携確認'];
    const isAutoKeyword = autoKeywords.some(k => incomingText === k);
    const isTimeCommand = /(?:配信時間|配信|届けて|通知)[はを]?\s*\d{1,2}\s*時/.test(incomingText);

    // 自動応答ルール (automations/auto_replies) でマッチするキーワード判定
    // → 自動応答が走るメッセージは「自動的にchatをunread化しない」(通知抑制)。
    let matchesAutomationRule = false;
    try {
      // アカウント厳密一致 (NULL = 全許可 は廃止)
      const accountFilter = lineAccountId
        ? { sql: ' AND line_account_id = ?', bind: [lineAccountId] }
        : { sql: ' AND line_account_id IS NULL', bind: [] as string[] };

      // 1. auto_replies に exact / contains で一致するか
      const autoReplyHit = await db
        .prepare(
          `SELECT 1 FROM auto_replies
           WHERE is_active = 1
             AND ((match_type='exact' AND keyword = ?) OR (match_type='contains' AND ? LIKE '%' || keyword || '%'))${accountFilter.sql}
           LIMIT 1`,
        )
        .bind(incomingText, incomingText, ...accountFilter.bind)
        .first();
      if (autoReplyHit) {
        matchesAutomationRule = true;
      } else {
        // 2. automations(message_received) で keyword/matchType マッチするか
        const automationHit = await db
          .prepare(
            `SELECT 1 FROM automations
             WHERE is_active = 1 AND event_type = 'message_received'
               AND (
                 (json_extract(conditions,'$.matchType')='exact' AND json_extract(conditions,'$.keyword') = ?)
                 OR
                 (COALESCE(json_extract(conditions,'$.matchType'),'contains')='contains' AND ? LIKE '%' || json_extract(conditions,'$.keyword') || '%')
               )${accountFilter.sql}
             LIMIT 1`,
          )
          .bind(incomingText, incomingText, ...accountFilter.bind)
          .first();
        if (automationHit) matchesAutomationRule = true;
      }
    } catch (e) {
      console.error('auto-rule match check failed:', e);
    }

    if (!isAutoKeyword && !isTimeCommand && !matchesAutomationRule) {
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

    // 自動返信チェック: auto_replies テーブルのみここで処理
    // automations テーブル (event_type='message_received') は L817 の fireEvent →
    // event-bus.ts:processAutomations で一本化処理する。ここで二重処理しない。
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event

    // auto_replies テーブル（レガシー）: アカウント厳密一致 (NULL = 全許可 は廃止)
    const autoReplyQuery = lineAccountId
      ? `SELECT * FROM auto_replies WHERE is_active = 1 AND line_account_id = ? ORDER BY created_at ASC`
      : `SELECT * FROM auto_replies WHERE is_active = 1 AND line_account_id IS NULL ORDER BY created_at ASC`;
    const autoReplies = await (lineAccountId
      ? db.prepare(autoReplyQuery).bind(lineAccountId)
      : db.prepare(autoReplyQuery))
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

          // CS→ナレッジ自動投入 (fire-and-forget)
          if (env?.NOTION_API_KEY && env?.NOTION_KNOWLEDGE_DB_ID) {
            try {
              extractCSKnowledge(incomingText, rule.response_content, {
                apiKey: env.NOTION_API_KEY,
                dbId: env.NOTION_KNOWLEDGE_DB_ID,
              }).catch((e) => console.error('extractCSKnowledge error:', e));
            } catch (e) {
              console.error('extractCSKnowledge setup error:', e);
            }
          }

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

    // automations テーブル (event_type='message_received') は L817 fireEvent → event-bus.ts に一本化。
    // ここで自前ループしない (二重発火防止)。

    // 購入意思キーワード検出 → Telegram即時通知 (取り逃し防止)。
    // 自由文 (自動応答ルールにマッチしない通常メッセージ) → Telegram通知。
    // この2つだけ通知が飛ぶことで「LINE公式アプリ通知うっとうしい」問題を解決。
    // 加えて: 事後報告 (振込完了/購入しました等) を検出して購入者タグ付与+通知。
    try {
      const purchaseKeywords = [
        '自己PRテンプレ申込',
        '30分スポットコンサル',
        'YouTubeアカウント開設',
        'オーディション対策レポート',
        'コンサルレポート制作',
      ];
      const intentRe = /(申込|購入したい|購入します|買いたい|欲しいです|注文)/;
      const isPurchaseIntent =
        purchaseKeywords.includes(incomingText.trim()) || intentRe.test(incomingText);

      // 事後報告 (購入完了/振込完了系) 検出。
      // 「振込完了」「振り込みました」「お支払いしました」「購入しました」「購入完了」等を含む。
      const completionRe = /(振込完了|振り込みました|振込みました|お支払いしました|支払いました|入金しました|購入しました|購入完了|お振込しました|お振込みしました)/;
      const isPurchaseCompletion = completionRe.test(incomingText);

      // どの商品に対する事後報告かを推測 (直近14日の発言+タグから)
      // note明示語 ('note買った/note購入しました/noteありがとう' 等) は最優先で note判定。
      let inferredProduct: 'front' | 'note' | 'brain' | 'consul' | null = null;
      let inferredTagId: string | null = null;
      const noteExplicitRe = /(note買いました|note買った|note購入しました|note購入完了|noteありがとう|noteお願い|note読みました|note記事買)/;
      const isNotePurchase = noteExplicitRe.test(incomingText);

      if (isPurchaseCompletion || isNotePurchase) {
        // 直近14日の incoming で 商品キーワードを送っているか
        const recent = await db
          .prepare(
            `SELECT content FROM messages_log
             WHERE friend_id = ? AND direction = 'incoming'
               AND created_at >= datetime('now','-14 days','+9 hours')
             ORDER BY created_at DESC LIMIT 50`,
          )
          .bind(friend.id)
          .all<{ content: string }>();
        const recentText = (recent.results || []).map((r) => r.content).join('\n');
        // タグも見る
        const friendTagsRows = await db
          .prepare(
            `SELECT t.name FROM friend_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.friend_id = ?`,
          )
          .bind(friend.id)
          .all<{ name: string }>();
        const tagNames = new Set((friendTagsRows.results || []).map((r) => r.name));

        // 推測順序: noteの明示報告 > フロント商品 > Brain > note > コンサル
        if (isNotePurchase) {
          inferredProduct = 'note';
          inferredTagId = '2ab8814a-f00b-4121-92d8-5f4e8c4b52ee'; // note購入者
        } else if (/(自己PRテンプレ申込|自己PRテンプレ|自己PR診断書|テンプレート)/.test(recentText) || tagNames.has('自己PR興味')) {
          inferredProduct = 'front';
          inferredTagId = '93326d5f-3949-4564-817a-4d2bee9c6bf1'; // フロント商品購入者
        } else if (tagNames.has('Brainクリック') || /(Brain|オーディション完全攻略|教材買|教材購入)/.test(recentText)) {
          inferredProduct = 'brain';
          inferredTagId = '8a691214-a04a-4ed9-b72f-e59a83f338a8'; // Brain購入者
        } else if (
          /(コンサルレポート|コンサルレポート申込|30分スポットコンサル|YouTubeアカウント開設|オーディション対策レポート)/.test(recentText) ||
          tagNames.has('コンサル興味')
        ) {
          inferredProduct = 'consul';
          // コンサル系専用タグは無いので汎用ログのみ
          inferredTagId = null;
        }

        if (inferredTagId) {
          try {
            await addTagToFriend(db, friend.id, inferredTagId);
            // tag_added イベント発火 (Brain購入者upsell シナリオ等の連鎖)
            await fireEvent(
              db,
              'tag_added',
              { friendId: friend.id, eventData: { tagId: inferredTagId, action: 'add' } },
              lineAccessToken,
              lineAccountId,
            );
          } catch (e) {
            console.error('purchase completion tag add failed:', e);
          }
        }
      }

      // 自由文判定: 自動応答ルールに無い (= matchesAutomationRule=false) かつ
      // ハードコードキーワードでもない かつ 配信時間コマンドでもない、ある程度の長さがあるテキスト。
      // 単発「はい」等のノイズを抑えるため最低3文字。500文字でtruncate。
      const isFreeText =
        !matchesAutomationRule && !isAutoKeyword && !isTimeCommand && incomingText.trim().length >= 3;

      if ((isPurchaseIntent || isPurchaseCompletion || isNotePurchase || isFreeText) && env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_CHAT_ID) {
        const { notifyTelegramSimple } = await import('../services/telegram-notify.js');
        // line_accounts.name と channel_id を取得 (channel_id は LINE Official Account の数値ID)
        const account = lineAccountId
          ? await db
              .prepare('SELECT name, channel_id FROM line_accounts WHERE id = ?')
              .bind(lineAccountId)
              .first<{ name: string; channel_id: string }>()
          : null;
        const accountLabel = account?.name || lineAccountId || 'default';
        // LINE Official Account Manager のチャット直リンク。
        // 形式: https://chat.line.biz/{channelId}/chat/{lineUserId}
        // 開くと該当友達のトーク画面に直行できる。
        const lineUserId = event.source.userId ?? '';
        const chatLink =
          account?.channel_id && lineUserId
            ? `https://chat.line.biz/${account.channel_id}/chat/${lineUserId}`
            : null;

        let header: string;
        if (isPurchaseCompletion || isNotePurchase) {
          const label = inferredProduct === 'front'
            ? '(フロント商品購入者タグ付与済)'
            : inferredProduct === 'note'
              ? '(note購入者タグ付与済)'
              : inferredProduct === 'brain'
                ? '(Brain購入者タグ付与済)'
                : inferredProduct === 'consul'
                  ? '(コンサル系・タグ未付与)'
                  : '(商品判別不能)';
          header = `💰 購入完了報告 ${label}`;
        } else if (isPurchaseIntent) {
          header = '🛒 購入意思キーワードを検出';
        } else {
          header = '💬 自由文メッセージ受信';
        }
        const lines = [
          header,
          `アカウント: ${accountLabel}`,
          `送信者: ${friend.display_name ?? '(名前未取得)'}`,
          '',
          'メッセージ:',
          incomingText.length > 500 ? incomingText.slice(0, 500) + '…' : incomingText,
        ];
        if (chatLink) {
          lines.push('', `🔗 LINEで返信: ${chatLink}`);
        }
        const text = lines.join('\n');
        // fire-and-forget
        notifyTelegramSimple(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text).catch((e) =>
          console.error('telegram notify failed:', e),
        );
      }
    } catch (e) {
      console.error('telegram notify detect error:', e);
    }

    // OS: classify, log, and notify (バリリンガルのみ)
    // matchedAccountId=null はデフォルトアカウント（=バリリンガル）を意味する
    const OS_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';
    const isBarilingual = lineAccountId === null || lineAccountId === OS_ACCOUNT_ID;
    if (!isBarilingual) {
      // バリリンガル以外のアカウントはOS処理をスキップ
    } else try {
      const classResult = classify({
        text: incomingText,
        channel: 'line',
        tenant: 'barilingual',
      });
      await db.prepare(
        'INSERT INTO os_inquiry_log (line_user_id, message, module, confidence, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        event.source?.userId ?? 'unknown',
        incomingText,
        classResult.module,
        classResult.confidence,
        'received'
      ).run();

      // ドラフト生成（テンプレート優先→Gemini）
      let draft: string | undefined;
      let draftSource: string | undefined;
      if (classResult.module === 'inquiry') {
        const quickDraft = tryQuickAnswer(incomingText);
        if (quickDraft) {
          draft = quickDraft;
          draftSource = 'テンプレート';
        } else if (env?.GROQ_API_KEY) {
          try {
            const groqDraft = await buildGroqInquiryDraft(db, {
              message: incomingText,
              groqApiKey: env.GROQ_API_KEY,
              friendId: friend?.id,
            });
            if (groqDraft) {
              draft = groqDraft;
              draftSource = 'Groq';
            }
          } catch (err) {
            console.error('Draft generation error:', err);
          }
        }
      }

      // Telegram通知（inquiry のみ）
      if (
        classResult.module === 'inquiry' &&
        draft &&
        env?.TELEGRAM_BOT_TOKEN &&
        env?.TELEGRAM_CHAT_ID
      ) {
        await sendInquiryTelegramNotification(db, env, {
          lineUserId: event.source?.userId ?? 'unknown',
          message: incomingText,
          draft,
        });
      }
    } catch (err) {
      console.error('OS classify/log error:', err);
    }

    // イベントバス発火: message_received
    // auto_replies で既にmatchしている場合は automations をスキップ (二重応答防止)。
    // ただし他のリスナー (Webhook転送/スコアリング/通知) は呼ぶ必要があるので、
    // payload に skipAutomations フラグを付けて伝達。
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched, skipAutomations: matched },
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
          await syncBaliDiagnosisCompleteFromSurvey(db, env, {
            lineAccountId,
            lineUserId: userId,
            friendId: friend.id,
            surveyId,
            answers,
          });

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
            if (isBaliRyugakuCenterDiagnosis(lineAccountId, surveyId)) {
              await lineClient.replyMessage(postbackEvent.replyToken, [
                buildMessage('text', BALI_DIAGNOSIS_COMPLETION_TEXT),
              ]);
              return;
            }
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

    const richMenuText = extractRichMenuDisplayText(postbackData);
    if (richMenuText) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) return;

      let friend = await getFriendByLineUserId(db, userId);
      if (!friend) {
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
      }

      await db
        .prepare(
          `INSERT OR IGNORE INTO messages_log (id, friend_id, direction, message_type, content, created_at)
           VALUES (?, ?, 'incoming', 'text', ?, ?)`,
        )
        .bind(crypto.randomUUID(), friend.id, richMenuText, jstNow())
        .run();
      await upsertChatOnMessage(db, friend.id);

      await fireEvent(db, 'message_received', {
        friendId: friend.id,
        eventData: { text: richMenuText, source: 'rich_menu_postback' },
      }, lineAccessToken, lineAccountId);
      return;
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

    // CTA choice postback: cta_choice:{trackedLinkId}
    // ボタン押下→tag付与+scenario enroll+reply(redirect URL or 受付完了)
    // tracked_links テーブルの tag_id, scenario_id, original_url を引いて自動処理
    if (postbackData.startsWith('cta_choice:')) {
      const userId = event.source.type === 'user' ? event.source.userId : undefined;
      if (!userId) { console.log('cta_choice: no userId'); return; }

      const linkId = postbackData.substring('cta_choice:'.length);
      if (!linkId) { console.log('cta_choice: no linkId'); return; }

      try {
        // friend identification (auto-register if missing, like survey postback)
        let friend = await getFriendByLineUserId(db, userId);
        if (!friend) {
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
        }

        // Look up tracked_link
        const link = await db
          .prepare('SELECT id, name, original_url, tag_id, scenario_id FROM tracked_links WHERE id = ? AND is_active = 1')
          .bind(linkId)
          .first<{ id: string; name: string; original_url: string; tag_id: string | null; scenario_id: string | null }>();
        if (!link) {
          console.log('cta_choice: tracked_link not found:', linkId);
          return;
        }

        // Record click (anonymized to friend)
        const clickId = crypto.randomUUID();
        await db
          .prepare('INSERT INTO link_clicks (id, tracked_link_id, friend_id, clicked_at) VALUES (?, ?, ?, ?)')
          .bind(clickId, link.id, friend.id, jstNow())
          .run();
        await db
          .prepare('UPDATE tracked_links SET click_count = click_count + 1, updated_at = ? WHERE id = ?')
          .bind(jstNow(), link.id)
          .run();

        // Tag assignment
        if (link.tag_id) {
          await addTagToFriend(db, friend.id, link.tag_id);
          // Fire tag_added event so trigger-based scenarios can react
          await fireEvent(
            db,
            'tag_added',
            { friendId: friend.id, tagId: link.tag_id },
            lineAccessToken,
            lineAccountId,
          );
        }

        // Scenario enrollment + immediate Step1 delivery (delay=0 step is replied here)
        // Time-window restriction in enrollFriendInScenario only applies to delay>0 steps.
        // For delay=0, we deliver Step1 inline as the reply, and step-delivery cron will
        // pick up subsequent steps based on their delay.
        let stepReplyMessage: ReturnType<typeof buildMessage> | null = null;
        if (link.scenario_id) {
          const existing = await db
            .prepare('SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?')
            .bind(friend.id, link.scenario_id)
            .first<{ id: string }>();
          if (!existing) {
            await enrollFriendInScenario(db, friend.id, link.scenario_id);
          }

          // Get Step1 to deliver inline
          const step1 = await db
            .prepare(
              `SELECT id, message_type, message_content
               FROM scenario_steps
               WHERE scenario_id = ? AND step_order = 1
               LIMIT 1`,
            )
            .bind(link.scenario_id)
            .first<{ id: string; message_type: string; message_content: string }>();
          if (step1) {
            const expandedContent = expandVariables(
              step1.message_content,
              friend as { id: string; display_name: string | null; user_id: string | null },
              workerUrl,
            );
            stepReplyMessage = buildMessage(step1.message_type, expandedContent);

            // Mark Step1 as delivered: advance current_step_order to 1 and compute next_delivery_at for Step2
            const step2 = await db
              .prepare(
                `SELECT id, delay_minutes, delivery_hour
                 FROM scenario_steps
                 WHERE scenario_id = ? AND step_order = 2
                 LIMIT 1`,
              )
              .bind(link.scenario_id)
              .first<{ id: string; delay_minutes: number; delivery_hour: number | null }>();

            let nextDeliveryAt: string | null = null;
            if (step2 && step2.delay_minutes > 0) {
              const rawDate = new Date(Date.now() + 9 * 60 * 60_000 + step2.delay_minutes * 60_000);
              if (step2.delivery_hour !== null && step2.delivery_hour !== undefined) {
                rawDate.setUTCHours(step2.delivery_hour, 0, 0, 0);
              } else {
                const hours = rawDate.getUTCHours();
                if (hours < 9 || hours >= 21) {
                  if (hours >= 21) rawDate.setUTCDate(rawDate.getUTCDate() + 1);
                  rawDate.setUTCHours(9, 0, 0, 0);
                }
              }
              nextDeliveryAt = rawDate.toISOString().slice(0, -1) + '+09:00';
            }

            await db
              .prepare(
                `UPDATE friend_scenarios
                 SET current_step_order = 1, next_delivery_at = ?, updated_at = ?
                 WHERE friend_id = ? AND scenario_id = ?`,
              )
              .bind(nextDeliveryAt, jstNow(), friend.id, link.scenario_id)
              .run();

            // Log Step1 delivery
            const logId = crypto.randomUUID();
            await db
              .prepare(
                `INSERT INTO messages_log (id, friend_id, direction, message_type, content, scenario_step_id, created_at)
                 VALUES (?, ?, 'outgoing', ?, ?, ?, ?)`,
              )
              .bind(logId, friend.id, step1.message_type, step1.message_content, step1.id, jstNow())
              .run();
          }
        }

        // Reply with Step1 content (or fallback ack if no scenario)
        const replyMsg = stepReplyMessage ?? buildMessage('text', '受付しました🌸');
        try {
          await lineClient.replyMessage(postbackEvent.replyToken, [replyMsg]);
        } catch {
          await lineClient.pushMessage(userId, [replyMsg]);
        }

        // Telegram notification: who pressed which CTA button (await to ensure fetch completes before isolate ends)
        if (env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_CHAT_ID) {
          try {
            const { notifyTelegramSimple } = await import('../services/telegram-notify.js');
            const userName = friend.display_name || 'unknown';
            const text = [
              `🌸 CTAボタン押下`,
              `👤 ${userName}`,
              `🔘 ${link.name}`,
              `🏷️ tag: ${link.tag_id ? 'attached' : '-'}`,
              `📋 scenario: ${link.scenario_id ? 'enrolled+Step1 sent' : '-'}`,
              `🔗 ${link.original_url}`,
            ].join('\n');
            console.log('cta_choice: about to send Telegram notification');
            await notifyTelegramSimple(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);
            console.log('cta_choice: Telegram notification sent');
          } catch (e) {
            console.error('cta_choice telegram notify failed:', e);
          }
        } else {
          console.log('cta_choice: Telegram env missing', { tokenPresent: !!env?.TELEGRAM_BOT_TOKEN, chatIdPresent: !!env?.TELEGRAM_CHAT_ID });
        }
      } catch (err) {
        console.error('Failed to process cta_choice postback', err);
      }
    }

    return;
  }
}

function extractRichMenuDisplayText(postbackData: string): string | null {
  try {
    const parsed = JSON.parse(postbackData) as { provider?: string; text?: unknown };
    if (parsed.provider === 'lml' && typeof parsed.text === 'string' && parsed.text.trim()) {
      return parsed.text.trim();
    }
  } catch {
    return null;
  }
  return null;
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

/**
 * Lステップ webhook 転送
 * LINE からの生ペイロードをそのまま転送し、Lステップのシナリオ実行を維持する。
 */
async function forwardToLstep(url: string, rawBody: string, signature: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': signature,
      },
      body: rawBody,
    });
    if (!res.ok) {
      console.error(`Lstep forward failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('Lstep forward error:', err);
  }
}

async function syncBaliLineRegistrationFromFollow(
  db: D1Database,
  input: {
    lineAccountId: string | null;
    lineUserId: string;
    friendId: string;
    metadataSource: string;
  },
): Promise<void> {
  const baliLineAccountId = '3e005b38-0adf-492f-9648-ee09d7c78424';
  const baliAccountKey = 'bali_ryugaku_center';
  if (input.lineAccountId !== baliLineAccountId) return;

  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS bali_line_registrations (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          line_user_id TEXT NOT NULL,
          friend_id TEXT,
          click_id TEXT,
          device_id TEXT,
          source TEXT,
          cta_position TEXT,
          lp_variant TEXT,
          registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
        )`,
      )
      .run();

    const existing = await db
      .prepare('SELECT id FROM bali_line_registrations WHERE account_id = ? AND line_user_id = ? LIMIT 1')
      .bind(baliAccountKey, input.lineUserId)
      .first<{ id: string }>();
    if (existing) return;

    await db
      .prepare(
        `INSERT INTO bali_line_registrations (
          id, account_id, line_user_id, friend_id, source, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), baliAccountKey, input.lineUserId, input.friendId, input.metadataSource, jstNow())
      .run();
  } catch (err) {
    console.error('Bali line registration sync failed:', err);
  }
}

async function syncBaliDiagnosisCompleteFromSurvey(
  db: D1Database,
  env: Env['Bindings'] | undefined,
  input: {
    lineAccountId: string | null;
    lineUserId: string;
    friendId: string;
    surveyId: string;
    answers: Record<string, string>;
  },
): Promise<void> {
  const baliLineAccountId = '3e005b38-0adf-492f-9648-ee09d7c78424';
  const baliAccountKey = 'bali_ryugaku_center';
  if (input.lineAccountId !== baliLineAccountId) return;

  const completedAt = jstNow();
  try {
    const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ? LIMIT 1').bind(input.friendId).first<{ metadata: string | null }>();
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(existing?.metadata || '{}') as Record<string, unknown>;
    } catch {
      metadata = {};
    }

    const merged = {
      ...metadata,
      account_key: baliAccountKey,
      line_account_id: baliLineAccountId,
      official_line_id: '@391irgle',
      line_channel_id: '2004191362',
      diagnosis_completed_at: completedAt,
      scenario_status: '診断済',
      diagnosis_source: 'line_harness_survey',
      diagnosis_survey_id: input.surveyId,
      diagnosis_answers: input.answers,
    };
    await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(merged), completedAt, input.friendId)
      .run();

    await db.prepare(
      `CREATE TABLE IF NOT EXISTS conversion_points (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        value REAL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
      )`,
    ).run();
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS conversion_events (
        id TEXT PRIMARY KEY,
        conversion_point_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        user_id TEXT,
        affiliate_code TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
      )`,
    ).run();

    let point = await db.prepare('SELECT id FROM conversion_points WHERE event_type = ? AND name = ? LIMIT 1')
      .bind('diagnosis_complete', 'バリ島留学センター 診断完了')
      .first<{ id: string }>();
    if (!point) {
      point = { id: crypto.randomUUID() };
      await db.prepare('INSERT INTO conversion_points (id, name, event_type, value, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(point.id, 'バリ島留学センター 診断完了', 'diagnosis_complete', null, completedAt)
        .run();
    }
    await db.prepare(
      `INSERT INTO conversion_events (id, conversion_point_id, friend_id, user_id, affiliate_code, metadata, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
      .bind(crypto.randomUUID(), point.id, input.friendId, input.lineUserId, JSON.stringify({
        ...merged,
        conversion_source: baliAccountKey,
        conversion_event: 'diagnosis_complete',
      }), completedAt)
      .run();

    await sendBaliMetaLeadFromSurvey(env, {
      lineUserId: input.lineUserId,
      friendId: input.friendId,
      completedAt,
      metadata: merged,
    });
  } catch (err) {
    console.error('Bali diagnosis complete sync failed:', err);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendBaliMetaLeadFromSurvey(
  env: Env['Bindings'] | undefined,
  input: { lineUserId: string; friendId: string; completedAt: string; metadata: Record<string, unknown> },
): Promise<void> {
  const accessToken = env?.META_ACCESS_TOKEN || env?.META_CAPI_ACCESS_TOKEN;
  if (!env?.META_PIXEL_ID || !accessToken) return;
  const eventId =
    typeof input.metadata.click_id === 'string' && input.metadata.click_id
      ? `diagnosis_complete:${input.metadata.click_id}`
      : `diagnosis_complete:${input.lineUserId}:${input.completedAt.slice(0, 10)}`;
  const eventTime = Math.floor(Date.parse(input.completedAt) / 1000) || Math.floor(Date.now() / 1000);
  const response = await fetch(`https://graph.facebook.com/v20.0/${env.META_PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      data: [{
        event_name: 'Lead',
        event_time: eventTime,
        event_id: eventId,
        action_source: 'system_generated',
        user_data: {
          external_id: [await sha256Hex(input.lineUserId || input.friendId)],
        },
        custom_data: {
          account_key: 'bali_ryugaku_center',
          lead_source: 'diagnosis_complete',
          status: 'diagnosis_complete',
          campaign_id: input.metadata.campaign_id ?? null,
          adset_id: input.metadata.adset_id ?? null,
          ad_id: input.metadata.ad_id ?? null,
          utm_campaign: input.metadata.utm_campaign ?? input.metadata.campaign ?? null,
          utm_content: input.metadata.utm_content ?? input.metadata.content ?? null,
        },
      }],
    }),
  });
  if (!response.ok) {
    console.error(`Bali Meta Lead from survey failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
}

async function buildGroqInquiryDraft(
  db: D1Database,
  params: { message: string; groqApiKey: string; friendId: string | undefined },
): Promise<string | null> {
  const fewShotRows = await db
    .prepare(
      `SELECT icl.final_draft as finalDraft, oil.message
       FROM inquiry_correction_log icl
       JOIN os_inquiry_log oil ON icl.inquiry_id = oil.id
       WHERE icl.correction_type = 'approved' AND icl.final_draft IS NOT NULL
       ORDER BY icl.created_at DESC LIMIT 3`,
    )
    .all<{ finalDraft: string; message: string }>();
  const fewShots = (fewShotRows.results ?? []).map((r) => ({
    message: r.message,
    finalDraft: r.finalDraft,
  }));

  const historyRows = params.friendId
    ? await db
        .prepare(
          `SELECT direction, content FROM messages_log
           WHERE friend_id = ? ORDER BY created_at DESC LIMIT 10`,
        )
        .bind(params.friendId)
        .all<{ direction: string; content: string }>()
    : { results: [] as { direction: string; content: string }[] };

  const history = [...(historyRows.results ?? [])].reverse().map(
    (r) => `${r.direction === 'incoming' ? 'ユーザー' : '返信'}: ${r.content}`,
  );

  const fewShotSection = fewShots.length > 0
    ? '\n## 過去の良い返信例\n' + fewShots.map((fs, i) =>
        `### 例${i + 1}\n質問: ${fs.message}\n返信: ${fs.finalDraft}`
      ).join('\n\n')
    : '';

  const historySection = history.length > 0
    ? '\n## 過去のやり取り\n' + history.join('\n')
    : '';

  const systemPrompt = `あなたはバリリンガル（バリ島の語学学校）のCSスタッフです。
LINEで問い合わせが来た際の返信ドラフトを作成してください。

## バリリンガル事業情報
入学金: 30,000円（別途必須）
1人部屋: 1週間119,800円 / 2週間219,800円 / 4週間349,800円
ペア留学: 1週間98,000円 / 2週間189,000円 / 4週間320,000円
外泊（自己手配）: 1週間85,000円 / 2週間163,000円 / 4週間246,000円
含まれるもの: 授業料・食事(朝/昼)・空港送迎・卒業証書
コース: 英語・ビジネス英語・TOEIC対策・ワーホリ準備・サーフィン英語・ヨガ英語など全9種
${fewShotSection}

## 返信ルール
- 親しみやすいが信頼感あり。「!」はOK、絵文字は最小限
- 質問には即答。不明な場合は「確認してお伝えします」
- CTAは1つに絞る。200文字以内で簡潔に
- 返信文のみを出力。前置きや説明は不要

## 禁止事項
- 「スタッフ常駐」と書かない
- 不確かな料金を書かない
- 入学金30,000円は必ず「別途」と書く`;

  const userPrompt = `${historySection}

## お客様のメッセージ
${params.message}

上記に対する返信ドラフトを書いてください。`;

  return generateDraftWithGroq({
    systemPrompt,
    userPrompt,
    groqApiKey: params.groqApiKey,
  });
}

async function sendInquiryTelegramNotification(
  db: D1Database,
  bindings: Env['Bindings'],
  params: { lineUserId: string; message: string; draft: string },
): Promise<void> {
  const token = bindings.TELEGRAM_BOT_TOKEN;
  const chatId = bindings.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const logRow = await db
    .prepare(`SELECT id FROM os_inquiry_log WHERE line_user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(params.lineUserId)
    .first<{ id: string }>();

  const friendForName = await db
    .prepare('SELECT display_name FROM friends WHERE line_user_id = ? LIMIT 1')
    .bind(params.lineUserId)
    .first<{ display_name: string | null }>();

  if (!logRow) return;

  await db
    .prepare(`UPDATE os_inquiry_log SET telegram_draft = ? WHERE id = ?`)
    .bind(params.draft, logRow.id)
    .run();

  await notifyTelegram({
    botToken: token,
    chatId,
    lineUserId: params.lineUserId,
    userName: friendForName?.display_name ?? params.lineUserId,
    message: params.message,
    draft: params.draft,
    inquiryLogId: logRow.id,
  });
}

export { webhook };
