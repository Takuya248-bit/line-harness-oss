/**
 * LINE Insight Followers 日次集計
 *
 * 毎日 0:00 UTC (9:00 JST) cron でアクティブな line_accounts 全てに対して
 * /v2/bot/insight/followers を叩いて line_followers_insights に保存.
 *
 * status='unready' の場合は当日分はまだ未確定なので skip.
 */

import { LineClient } from '@line-crm/line-sdk';
import { getLineAccounts, jstNow } from '@line-crm/db';

export async function collectInsightFollowers(db: D1Database): Promise<{
  attempted: number;
  saved: number;
  failed: number;
}> {
  let attempted = 0;
  let saved = 0;
  let failed = 0;

  const accounts = await getLineAccounts(db);
  const activeAccounts = accounts.filter((a) => a.is_active && a.channel_access_token);

  // 昨日の日付 (UTC) を YYYYMMDD で
  const y = new Date(Date.now() - 24 * 60 * 60_000);
  const yyyy = y.getUTCFullYear();
  const mm = String(y.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(y.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  for (const account of activeAccounts) {
    attempted++;
    try {
      const client = new LineClient(account.channel_access_token);
      const insight = await client.getInsightFollowers(dateStr);

      // unready or out_of_service は記録しない
      if (insight.status !== 'ready') {
        console.log(`insight ${account.id} ${dateStr} status=${insight.status}, skip`);
        continue;
      }

      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT OR REPLACE INTO line_followers_insights
            (id, line_account_id, insight_date, status, followers, targeted_reaches, blocks, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          account.id,
          dateStr,
          insight.status,
          insight.followers ?? null,
          insight.targetedReaches ?? null,
          insight.blocks ?? null,
          jstNow(),
        )
        .run();
      saved++;
    } catch (err) {
      console.error(`insight collect failed for ${account.id}:`, err);
      failed++;
    }
  }

  return { attempted, saved, failed };
}
