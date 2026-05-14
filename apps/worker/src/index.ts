import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { LineClient } from '@line-crm/line-sdk';
import { getLineAccounts } from '@line-crm/db';
import { processStepDeliveries } from './services/step-delivery.js';
import { processScheduledBroadcasts } from './services/broadcast.js';
import { processReminderDeliveries } from './services/reminder-delivery.js';
import { checkAccountHealth } from './services/ban-monitor.js';
import { refreshLineAccessTokens } from './services/token-refresh.js';
import { processNotificationDeliveries } from './services/notification-delivery.js';
import { authMiddleware } from './middleware/auth.js';
import { webhook } from './routes/webhook.js';
import { friends } from './routes/friends.js';
import { tags } from './routes/tags.js';
import { scenarios } from './routes/scenarios.js';
import { broadcasts } from './routes/broadcasts.js';
import { users } from './routes/users.js';
import { lineAccounts } from './routes/line-accounts.js';
import { conversions } from './routes/conversions.js';
import { affiliates } from './routes/affiliates.js';
import { abTests } from './routes/ab-tests.js';
import { openapi } from './routes/openapi.js';
import { liffRoutes } from './routes/liff.js';
// Round 3 ルート
import { webhooks } from './routes/webhooks.js';
import { calendar } from './routes/calendar.js';
import { reminders } from './routes/reminders.js';
import { scoring } from './routes/scoring.js';
import { templates } from './routes/templates.js';
import { chats } from './routes/chats.js';
import { notifications } from './routes/notifications.js';
import { stripe } from './routes/stripe.js';
import { health } from './routes/health.js';
import { automations } from './routes/automations.js';
import { richMenus } from './routes/rich-menus.js';
import { trackedLinks } from './routes/tracked-links.js';
import { adminFollowersSync } from './routes/admin-followers-sync.js';
import { forms } from './routes/forms.js';
import { analytics } from './routes/analytics.js';
import { balilingualAnalytics } from './routes/balilingual-analytics.js';
import { xPosts } from './routes/x-posts.js';
import { surveys } from './routes/surveys.js';
import { bookings } from './routes/bookings.js';
import { tagFolders } from './routes/tag-folders.js';
import { processXPosting } from './services/x-posting.js';
import { trackEngagement } from './services/x-engagement-tracker.js';
import { collectAiSources } from './services/x-ai-source-collector.js';
import { friendFields } from './routes/friend-fields.js';
import { savedFilters } from './routes/saved-filters.js';
import { processPhaseTransitions } from './services/phase-cron.js';
import { osDashboard } from './routes/os-dashboard.js';
import { osIntake } from './routes/os-intake.js';
import { discordInteractions } from './routes/discord-interactions.js';
import { baliRedirect } from './routes/bali-redirect.js';
import { telegramWebhook } from './routes/telegram-webhook.js';
import { checkDormantFriends, sendWeeklyReport } from './services/os-cron.js';
import { collectInsightFollowers } from './services/insight-cron.js';
import { insightDashboard } from './routes/insight-dashboard.js';
import {
  BALILINGUAL_LINE_ACCOUNT_ID,
  processBalilingualEstimateReminders,
} from './services/balilingual-estimate-reminder-cron.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
    LIFF_URL: string;
    LINE_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_SECRET: string;
    WORKER_URL: string;
    ALLOWED_ORIGINS?: string;
    // X (Twitter) API credentials
    X_API_KEY: string;
    X_API_SECRET: string;
    X_ACCESS_TOKEN: string;
    X_ACCESS_SECRET: string;
    // AI content generation
    ANTHROPIC_API_KEY?: string;
    // X posting config
    X_MAX_DAILY_POSTS?: string;
    // Google Calendar (Service Account)
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_KEY?: string;
    GOOGLE_CALENDAR_ID?: string;
    BALILINGUAL_DRY_RUN_BOOKING?: string;
    // Lステップ proxy forwarding
    LSTEP_WEBHOOK_URL?: string;
    DISCORD_WEBHOOK_URL?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_APP_PUBLIC_KEY?: string;
    DISCORD_CHANNEL_ID?: string;
    GROQ_API_KEY?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    TELEGRAM_NOTIFY?: string;
    TELEGRAM_NOTIFY_DISABLE_HIGH_VALUE?: string;
    GEMINI_API_KEY?: string;
    META_PIXEL_ID?: string;
    META_ACCESS_TOKEN?: string;
    META_CAPI_ACCESS_TOKEN?: string;
    // Notion knowledge DB
    NOTION_API_KEY?: string;
    NOTION_KNOWLEDGE_DB_ID?: string;
    // x-auto-poster GitHub 連携（Discord ボタン承認）
    GITHUB_TOKEN?: string;
    XPOSTER_GITHUB_REPO?: string;
  };
};

const app = new Hono<Env>();

// CORS — configurable via ALLOWED_ORIGINS env var (comma-separated), defaults to '*'
app.use('*', async (c, next) => {
  const raw = c.env.ALLOWED_ORIGINS || '*';
  const origin = raw === '*' ? '*' : raw.split(',').map((s) => s.trim());
  return cors({ origin })(c, next);
});

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

// Debug: test automation matching
app.post('/api/debug/test-autoreply', async (c) => {
  const db = c.env.DB;
  const { text } = await c.req.json<{ text: string }>();
  const results: string[] = [];

  // Check auto_replies
  const ar = await db.prepare('SELECT id, keyword, match_type FROM auto_replies WHERE is_active = 1').all();
  results.push(`auto_replies count: ${ar.results.length}`);

  // Check automations
  const am = await db.prepare("SELECT id, name, conditions, substr(actions,1,100) as actions_preview FROM automations WHERE is_active = 1 AND event_type = 'message_received'").all();
  results.push(`automations count: ${am.results.length}`);

  for (const a of am.results as any[]) {
    const cond = JSON.parse(a.conditions);
    const isMatch = cond.matchType === 'exact' ? text === cond.keyword : text.includes(cond.keyword);
    results.push(`  ${a.name}: keyword="${cond.keyword}" matchType=${cond.matchType} match=${isMatch}`);
  }

  // Try sending via LINE push
  try {
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
    await lineClient.pushMessage('Uc938c4a98e320d02c15744b950a25b6f', [{
      type: 'text',
      text: `Debug: automations matched for "${text}"\n${results.join('\n')}`,
    }]);
    results.push('pushMessage: OK');
  } catch (err: any) {
    results.push(`pushMessage error: ${err.message}`);
  }

  return c.json({ success: true, results });
});

// Mount route groups — MVP & Round 2
app.route('/', webhook);
app.route('/', friends);
app.route('/', tags);
app.route('/', scenarios);
app.route('/', broadcasts);
app.route('/', users);
app.route('/', lineAccounts);
app.route('/', conversions);
app.route('/', affiliates);
app.route('/', abTests);
app.route('/', openapi);
app.route('/', liffRoutes);

// Mount route groups — Round 3
app.route('/', webhooks);
app.route('/', calendar);
app.route('/', reminders);
app.route('/', scoring);
app.route('/', templates);
app.route('/', chats);
app.route('/', notifications);
app.route('/', stripe);
app.route('/', health);
app.route('/', automations);
app.route('/', richMenus);
app.route('/', trackedLinks);
app.route('/', adminFollowersSync);
app.route('/', insightDashboard);
app.route('/', forms);
app.route('/', analytics);
app.route('/', balilingualAnalytics);
app.route('/', xPosts);
app.route('/', surveys);
app.route('/', bookings);
app.route('/', tagFolders);
app.route('/', friendFields);
app.route('/', savedFilters);
app.route('/', osDashboard);
app.route('/', osIntake);
app.route('/', discordInteractions);
app.route('/', telegramWebhook);
app.route('/', baliRedirect);

// Short link: /r/:ref → landing page with LINE open button
app.get('/r/:ref', (c) => {
  const ref = c.req.param('ref');
  const liffUrl = c.env.LIFF_URL || 'https://liff.line.me/2009554425-4IMBmLQ9';
  const target = `${liffUrl}?ref=${encodeURIComponent(ref)}`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE Harness</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:400px;width:90%;padding:48px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:8px}
.sub{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:40px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;text-align:center;color:#fff;background:#06C755;transition:opacity .15s}
.btn:active{opacity:.85}
.note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:24px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>LINE Harness</h1>
<p class="sub">L社 / U社 の無料代替 OSS</p>
<a href="${target}" class="btn">LINE で体験する</a>
<p class="note">友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます</p>
</div>
</body>
</html>`);
});

// Simple health check (no auth required — path is in auth middleware skip list)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Telegram smoke test (auth required by middleware)
app.get('/api/test-telegram', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const chatId = c.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return c.json({ success: false, error: 'TOKEN/CHAT_ID missing', tokenPresent: !!token, chatIdPresent: !!chatId });
  }
  const { notifyTelegramSimple } = await import('./services/telegram-notify.js');
  await notifyTelegramSimple(token, chatId, '🧪 cta_choice test ping (line-crm-worker)');
  return c.json({ success: true, sent_to: chatId });
});

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// Scheduled handler for cron triggers — split into 3 cron schedules to avoid CPU exhaustion.
//   "*/5 * * * *"  → light: step delivery / broadcast / reminder / notification
//   "17 * * * *"   → medium: phase transition / health / token refresh
//   "0 0 * * *"    → heavy: ai-sources / x-posting / x-engagement / dormant-alert / weekly report / insight fetch / duplicate detect
async function scheduled(
  event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  const dbAccounts = await getLineAccounts(env.DB);
  const activeTokens = new Set<string>();
  activeTokens.add(env.LINE_CHANNEL_ACCESS_TOKEN);
  for (const account of dbAccounts) {
    if (account.is_active) {
      activeTokens.add(account.channel_access_token);
    }
  }

  const cron = (event as unknown as { cron?: string }).cron;
  const jobs: Promise<unknown>[] = [];

  // ===== LIGHT CRON: every 5 minutes (delivery + broadcast + reminder) =====
  // 各アカウント単位でループ。lineAccountId を渡すことで、各処理は自アカウント分の
  // friend_scenarios / broadcasts のみ処理する (アカウント間競合の絶対防止)。
  if (cron === '*/5 * * * *' || !cron) {
    // デフォルト env account (line_account_id NULL の旧データ用)
    const defaultClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
    jobs.push(
      processStepDeliveries(env.DB, defaultClient, env.WORKER_URL, null),
      processScheduledBroadcasts(env.DB, defaultClient, env.WORKER_URL, null),
      processReminderDeliveries(env.DB, defaultClient),
      processNotificationDeliveries(env.DB, defaultClient),
    );
    // DB 上の各アカウント
    for (const account of dbAccounts) {
      if (!account.is_active) continue;
      const lineClient = new LineClient(account.channel_access_token);
      jobs.push(
        processStepDeliveries(env.DB, lineClient, env.WORKER_URL, account.id),
        processScheduledBroadcasts(env.DB, lineClient, env.WORKER_URL, account.id),
        // reminders/notifications は friend に紐付くので step-delivery と同様に
        // アカウント分離が望ましいが、現状サポートはあるので最小修正。
        processReminderDeliveries(env.DB, lineClient),
        processNotificationDeliveries(env.DB, lineClient),
      );
      if (account.id === BALILINGUAL_LINE_ACCOUNT_ID) {
        jobs.push(processBalilingualEstimateReminders(env.DB, lineClient));
      }
    }
    await Promise.allSettled(jobs);
    return;
  }

  // ===== MEDIUM CRON: hourly at :17 (phase / health / token) =====
  if (cron === '17 * * * *') {
    for (const account of dbAccounts) {
      if (account.is_active) {
        jobs.push(processPhaseTransitions(env.DB, account.id));
      }
    }
    jobs.push(checkAccountHealth(env.DB));
    jobs.push(refreshLineAccessTokens(env.DB));

    // アカウント未割当の有効レコード検出 (アカウント間競合防止)
    // 1時間に1回チェックし、検出時のみ Telegram 通知
    jobs.push((async () => {
      try {
        const r = await env.DB.prepare(`
          SELECT
            (SELECT COUNT(*) FROM automations WHERE is_active=1 AND line_account_id IS NULL) as a,
            (SELECT COUNT(*) FROM auto_replies WHERE is_active=1 AND line_account_id IS NULL) as ar,
            (SELECT COUNT(*) FROM scenarios WHERE is_active=1 AND line_account_id IS NULL) as s,
            (SELECT COUNT(*) FROM broadcasts WHERE status IN ('draft','scheduled') AND line_account_id IS NULL) as b
        `).first<{ a: number; ar: number; s: number; b: number }>();
        const total = (r?.a ?? 0) + (r?.ar ?? 0) + (r?.s ?? 0) + (r?.b ?? 0);
        if (total > 0 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          const { notifyTelegramSimple } = await import('./services/telegram-notify.js');
          await notifyTelegramSimple(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, [
            '⚠️ アカウント未割当の有効レコード検出',
            `automations: ${r?.a ?? 0}`,
            `auto_replies: ${r?.ar ?? 0}`,
            `scenarios: ${r?.s ?? 0}`,
            `broadcasts: ${r?.b ?? 0}`,
            '',
            'これらは「全アカウント横断」で発火しうるため、',
            '正しい line_account_id を設定してください。',
          ].join('\n'));
        }
      } catch (e) {
        console.error('account-isolation health check failed:', e);
      }
    })());

    await Promise.allSettled(jobs);
    return;
  }

  // ===== HEAVY CRON: daily at 0:00 UTC (= 9:00 JST) =====
  if (cron === '0 0 * * *') {
    // AI source collection
    jobs.push(
      collectAiSources(env.DB).then((r) =>
        console.log(`[ai-sources] Collected: HN=${r.hackernews}, RSS=${r.rss}`),
      ).catch((e) => console.error('[ai-sources] error:', e)),
    );

    // X auto-posting + engagement tracking
    if (env.X_API_KEY && env.X_ACCESS_TOKEN) {
      const xConfig = {
        apiKey: env.X_API_KEY,
        apiSecret: env.X_API_SECRET,
        accessToken: env.X_ACCESS_TOKEN,
        accessSecret: env.X_ACCESS_SECRET,
      };
      jobs.push(
        processXPosting(env.DB, xConfig, {
          maxDailyPosts: env.X_MAX_DAILY_POSTS ? parseInt(env.X_MAX_DAILY_POSTS, 10) : undefined,
        }).catch((e) => console.error('[x-posting] error:', e)),
      );
      jobs.push(
        trackEngagement(env.DB, xConfig).then((r) =>
          console.log(`[x-engagement] tracked=${r.tracked} failed=${r.failed}`),
        ).catch((e) => console.error('[x-engagement] error:', e)),
      );
    }

    // Business OS dormant alert (every day at 9:00 JST)
    jobs.push(checkDormantFriends(env.DB, env.DISCORD_WEBHOOK_URL).catch((e) => console.error('[dormant] error:', e)));

    // LINE Insight followers (前日分の followers/blocks 推移を保存)
    jobs.push(
      collectInsightFollowers(env.DB)
        .then((r) => console.log(`[insight-followers] attempted=${r.attempted} saved=${r.saved} failed=${r.failed}`))
        .catch((e) => console.error('[insight-followers] error:', e)),
    );
    // Weekly report (only on Monday JST)
    const now = new Date();
    const jstDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    if (jstDay === 1) {
      jobs.push(sendWeeklyReport(env.DB, env.DISCORD_WEBHOOK_URL).catch((e) => console.error('[weekly] error:', e)));
    }

    await Promise.allSettled(jobs);
    return;
  }

  // Unknown cron pattern: no-op
  console.warn(`[scheduled] Unknown cron: ${cron}`);
}

export default {
  fetch: app.fetch,
  scheduled,
};
