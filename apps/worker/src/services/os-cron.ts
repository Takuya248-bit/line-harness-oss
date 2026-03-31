/**
 * os-cron.ts - 業務OS定期実行タスク
 *
 * 1. 休眠アラート: 30日以上反応なしの友だちをDiscordに通知（毎朝9時JST）
 * 2. 週次レポート: 問い合わせ統計をDiscordに投稿（毎週月曜9時JST）
 */

const BARILINGUAL_ACCOUNT_ID = '1e7f64a9-50f5-4356-8fcb-228204e167c8';

/**
 * 休眠アラート（日次）
 * 30日以上メッセージがないアクティブな友だちをリストアップ
 */
export async function checkDormantFriends(
  db: D1Database,
  discordWebhookUrl?: string,
): Promise<void> {
  if (!discordWebhookUrl) return;

  const result = await db.prepare(`
    SELECT f.display_name, f.line_user_id,
           MAX(m.created_at) as last_message,
           CAST(julianday('now') - julianday(MAX(m.created_at)) AS INTEGER) as days_silent
    FROM friends f
    LEFT JOIN messages_log m ON f.id = m.friend_id
    WHERE f.line_account_id = ?
      AND f.is_blocked = 0
      AND f.follow_status = 'followed'
    GROUP BY f.id
    HAVING days_silent >= 30
    ORDER BY days_silent DESC
    LIMIT 20
  `).bind(BARILINGUAL_ACCOUNT_ID).all();

  if (!result.results || result.results.length === 0) return;

  const list = (result.results as any[])
    .map((r) => `- ${r.display_name ?? '名前なし'}: ${r.days_silent}日間無反応`)
    .join('\n');

  await fetch(discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '😴 休眠アラート（30日以上無反応）',
        description: list.length > 2000 ? list.slice(0, 2000) + '...' : list,
        color: 0xf59e0b,
        fields: [
          { name: '対象人数', value: `${result.results.length}名`, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Business OS / バリリンガル' },
      }],
    }),
  });
}

/**
 * 週次レポート（月曜日のみ実行）
 * 過去7日の問い合わせ統計をDiscordに投稿
 */
export async function sendWeeklyReport(
  db: D1Database,
  discordWebhookUrl?: string,
): Promise<void> {
  if (!discordWebhookUrl) return;

  const [total, byModule, byDay] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-7 days')`
    ).first<{ count: number }>(),

    db.prepare(
      `SELECT module, COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-7 days') GROUP BY module ORDER BY count DESC`
    ).all(),

    db.prepare(
      `SELECT date(created_at) as day, COUNT(*) as count FROM os_inquiry_log WHERE created_at >= datetime('now', '-7 days') GROUP BY date(created_at) ORDER BY day`
    ).all(),
  ]);

  const totalCount = total?.count ?? 0;
  const moduleBreakdown = (byModule.results as any[])
    .map((m) => `${m.module}: ${m.count}件`)
    .join(' / ');
  const dailyTrend = (byDay.results as any[])
    .map((d) => `${d.day.slice(5)}: ${d.count}件`)
    .join(' → ');

  await fetch(discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '📊 週次レポート',
        color: 0x3b82f6,
        fields: [
          { name: '総問い合わせ数', value: `${totalCount}件`, inline: true },
          { name: 'モジュール別', value: moduleBreakdown || 'データなし', inline: false },
          { name: '日別推移', value: dailyTrend || 'データなし', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Business OS / 週次レポート' },
      }],
    }),
  });
}
