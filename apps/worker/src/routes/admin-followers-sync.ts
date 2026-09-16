/**
 * Admin: LINE followers 一括同期エンドポイント
 *
 * LINE Messaging API の /v2/bot/followers/ids を使って、
 * 指定 line_account の全フォロワー (Premium/月100通プラン以上で利用可能) を取得し、
 * 各 userId につき getProfile して friends テーブルに upsert する.
 *
 * Rate limit対策:
 * - getFollowerIds: 1000件ずつページング
 * - getProfile: 100件ごとに 1秒 sleep
 * - 同期途中の失敗でも収集済み userId は記録される
 */

import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import { upsertFriend, getLineAccountById, jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

export const adminFollowersSync = new Hono<Env>();

interface SyncResult {
  accountId: string;
  accountName: string;
  totalFollowerIds: number;
  newlyInserted: number;
  alreadyExisted: number;
  profileFailed: number;
  pages: number;
  durationMs: number;
}

/**
 * POST /api/admin/sync-followers/:accountId
 * 同期実行 (要 API_KEY auth)
 */
adminFollowersSync.post('/api/admin/sync-followers/:accountId', async (c) => {
  const startedAt = Date.now();
  const accountId = c.req.param('accountId');
  const dryRun = c.req.query('dryRun') === 'true';

  const account = await getLineAccountById(c.env.DB, accountId);
  if (!account) {
    return c.json({ success: false, error: 'Account not found' }, 404);
  }
  if (!account.channel_access_token) {
    return c.json({ success: false, error: 'No channel_access_token' }, 400);
  }

  const lineClient = new LineClient(account.channel_access_token);

  // 既存DB friends 一覧取得 (差分判定用)
  const existing = await c.env.DB
    .prepare('SELECT line_user_id FROM friends WHERE line_account_id = ?')
    .bind(accountId)
    .all<{ line_user_id: string }>();
  const existingSet = new Set((existing.results || []).map((r) => r.line_user_id));

  // 1. 全 follower ID 取得 (ページング)
  const allUserIds: string[] = [];
  let pages = 0;
  let next: string | undefined;
  try {
    do {
      const page: { userIds: string[]; next?: string } = await lineClient.getFollowerIds(next, 1000);
      allUserIds.push(...(page.userIds || []));
      next = page.next;
      pages++;
      if (pages > 50) break; // safety: 5万人以上は別途対応
    } while (next);
  } catch (err) {
    return c.json({
      success: false,
      error: 'getFollowerIds failed',
      detail: err instanceof Error ? err.message : String(err),
      collectedSoFar: allUserIds.length,
    }, 500);
  }

  // 2. 差分の userId だけ抽出
  const toFetch = allUserIds.filter((uid) => !existingSet.has(uid));

  if (dryRun) {
    return c.json({
      success: true,
      dryRun: true,
      accountId,
      accountName: account.name,
      totalFollowerIds: allUserIds.length,
      alreadyExisted: allUserIds.length - toFetch.length,
      wouldInsert: toFetch.length,
      pages,
      durationMs: Date.now() - startedAt,
    });
  }

  // 3. 100件ごとに getProfile + upsert (rate limit対策で各100件後に1秒待つ)
  let inserted = 0;
  let profileFailed = 0;
  const CHUNK = 100;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          let profile;
          try {
            profile = await lineClient.getProfile(uid);
          } catch {
            // unfollow直後等で profile取得失敗 → name無しで登録
            profileFailed++;
          }
          const friend = await upsertFriend(c.env.DB, {
            lineUserId: uid,
            displayName: profile?.displayName ?? null,
            pictureUrl: profile?.pictureUrl ?? null,
            statusMessage: profile?.statusMessage ?? null,
          });
          await c.env.DB
            .prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
            .bind(accountId, friend.id)
            .run();
          inserted++;
        } catch (err) {
          console.error(`sync upsert failed for ${uid}:`, err);
        }
      }),
    );
    // rate limit (1秒待つ)
    if (i + CHUNK < toFetch.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const result: SyncResult = {
    accountId,
    accountName: account.name,
    totalFollowerIds: allUserIds.length,
    newlyInserted: inserted,
    alreadyExisted: allUserIds.length - toFetch.length,
    profileFailed,
    pages,
    durationMs: Date.now() - startedAt,
  };

  // Telegram通知 (env経由で送信)
  if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
    const { notifyTelegramSimple } = await import('../services/telegram-notify.js');
    const text = [
      `✅ LINE Followers 同期完了`,
      `アカウント: ${account.name}`,
      `総フォロワー: ${result.totalFollowerIds}`,
      `新規登録: ${result.newlyInserted}`,
      `既存: ${result.alreadyExisted}`,
      `Profile失敗: ${result.profileFailed}`,
      `ページ数: ${result.pages}`,
      `所要時間: ${(result.durationMs / 1000).toFixed(1)}秒`,
      `完了時刻(JST): ${jstNow()}`,
    ].join('\n');
    notifyTelegramSimple(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID, text).catch((e) =>
      console.error('sync notify failed:', e),
    );
  }

  return c.json({ success: true, ...result });
});
