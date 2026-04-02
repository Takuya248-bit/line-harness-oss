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
import { forms } from './routes/forms.js';
import { analytics } from './routes/analytics.js';
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
import { checkDormantFriends, sendWeeklyReport } from './services/os-cron.js';

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
    // Lステップ proxy forwarding
    LSTEP_WEBHOOK_URL?: string;
    DISCORD_WEBHOOK_URL?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_APP_PUBLIC_KEY?: string;
    DISCORD_CHANNEL_ID?: string;
    GROQ_API_KEY?: string;
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
app.route('/', forms);
app.route('/', analytics);
app.route('/', xPosts);
app.route('/', surveys);
app.route('/', bookings);
app.route('/', tagFolders);
app.route('/', friendFields);
app.route('/', savedFilters);
app.route('/', osDashboard);
app.route('/', osIntake);
app.route('/', discordInteractions);

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

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// Scheduled handler for cron triggers — runs for all active LINE accounts
async function scheduled(
  _event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  // Get all active accounts from DB, plus the default env account
  const dbAccounts = await getLineAccounts(env.DB);
  const activeTokens = new Set<string>();

  // Default account from env
  activeTokens.add(env.LINE_CHANNEL_ACCESS_TOKEN);

  // DB accounts
  for (const account of dbAccounts) {
    if (account.is_active) {
      activeTokens.add(account.channel_access_token);
    }
  }

  // Run delivery for each account
  const jobs = [];
  for (const token of activeTokens) {
    const lineClient = new LineClient(token);
    jobs.push(
      processStepDeliveries(env.DB, lineClient, env.WORKER_URL),
      processScheduledBroadcasts(env.DB, lineClient, env.WORKER_URL),
      processReminderDeliveries(env.DB, lineClient),
      processNotificationDeliveries(env.DB, lineClient),
    );
  }
  // Phase auto-transition for each active account
  for (const account of dbAccounts) {
    if (account.is_active) {
      jobs.push(processPhaseTransitions(env.DB, account.id));
    }
  }

  jobs.push(checkAccountHealth(env.DB));
  jobs.push(refreshLineAccessTokens(env.DB));

  // AI source collection (6時間に1回)
  const currentHour = new Date().getUTCHours();
  const baliHour = (currentHour + 8) % 24; // UTC+8 (WITA)
  if ([0, 6, 12, 18].includes(baliHour)) {
    const minute = new Date().getUTCMinutes();
    if (minute < 5) {
      jobs.push(
        collectAiSources(env.DB).then((r) =>
          console.log(`[ai-sources] Collected: HN=${r.hackernews}, RSS=${r.rss}`),
        ),
      );
    }
  }

  // X auto-posting (runs independently of LINE accounts)
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
      }),
    );
    // Engagement tracking — エラーでcron全体を止めない
    jobs.push(
      trackEngagement(env.DB, xConfig).then((r) =>
        console.log(`[x-engagement] tracked=${r.tracked} failed=${r.failed}`),
      ).catch((e) => console.error('[x-engagement] error:', e)),
    );
  }

  // Business OS: 休眠アラート（毎朝9時JST = 0時UTC）+ 週次レポート（月曜のみ）
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  const utcMinute = now.getUTCMinutes();
  if (jstHour === 9 && utcMinute < 5) {
    jobs.push(checkDormantFriends(env.DB, env.DISCORD_WEBHOOK_URL));
    // 月曜日（getUTCDay() === 1、ただしJSTでの月曜判定）
    const jstDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    if (jstDay === 1) {
      jobs.push(sendWeeklyReport(env.DB, env.DISCORD_WEBHOOK_URL));
    }
  }

  await Promise.allSettled(jobs);
}

export default {
  fetch: app.fetch,
  scheduled,
};
