/**
 * 通知配信処理 -- cronトリガーで定期実行
 *
 * pending状態の通知を取得し、チャネルに応じて配信する:
 * - line: LINE pushMessageで配信
 * - webhook: 登録済み送信Webhookへ POST
 * - dashboard: statusをsentに更新するだけ (UI側がポーリング)
 */

import {
  getPendingNotifications,
  updateNotificationStatus,
  getActiveOutgoingWebhooksByEvent,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import type { NotificationRow } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';

export async function processNotificationDeliveries(
  db: D1Database,
  lineClient: LineClient,
): Promise<void> {
  const pending = await getPendingNotifications(db, 200);
  if (pending.length === 0) return;

  for (const notification of pending) {
    try {
      switch (notification.channel) {
        case 'line':
          await deliverLine(db, lineClient, notification);
          break;
        case 'webhook':
          await deliverWebhook(db, notification);
          break;
        case 'dashboard':
          // ダッシュボード通知はDB記録のみ — sentにする
          await updateNotificationStatus(db, notification.id, 'sent');
          break;
        default:
          console.warn(`未知の通知チャネル: ${notification.channel}, id=${notification.id}`);
          await updateNotificationStatus(db, notification.id, 'sent');
          break;
      }
    } catch (err) {
      console.error(`通知配信失敗 id=${notification.id} channel=${notification.channel}:`, err);
      await updateNotificationStatus(db, notification.id, 'failed').catch(() => {});
    }
  }
}

/** LINE pushMessage で通知を配信 */
async function deliverLine(
  db: D1Database,
  lineClient: LineClient,
  notification: NotificationRow,
): Promise<void> {
  // bodyにfriendIdが含まれている場合、friendのline_user_idを取得して送信
  let friendId: string | undefined;
  try {
    const bodyData = JSON.parse(notification.body);
    friendId = bodyData.friendId;
  } catch {
    // bodyがJSON以外の場合は無視
  }

  if (!friendId) {
    // friendIdが不明な場合は配信不可 — sentとして処理（管理者通知扱い）
    console.warn(`LINE通知 id=${notification.id}: friendIdなし、スキップしてsent扱い`);
    await updateNotificationStatus(db, notification.id, 'sent');
    return;
  }

  const friend = await getFriendById(db, friendId);
  if (!friend) {
    console.warn(`LINE通知 id=${notification.id}: friend ${friendId} が見つかりません`);
    await updateNotificationStatus(db, notification.id, 'failed');
    return;
  }

  await lineClient.pushMessage(friend.line_user_id, [
    { type: 'text', text: notification.title },
  ]);

  await updateNotificationStatus(db, notification.id, 'sent');
}

/** Webhook (HTTP POST) で通知を配信 */
async function deliverWebhook(
  db: D1Database,
  notification: NotificationRow,
): Promise<void> {
  // 同じevent_typeの送信Webhookを取得して全てに配信
  const webhooks = await getActiveOutgoingWebhooksByEvent(db, notification.event_type);

  if (webhooks.length === 0) {
    // 送信先Webhookがない場合もsentとして処理
    await updateNotificationStatus(db, notification.id, 'sent');
    return;
  }

  const payload = JSON.stringify({
    notificationId: notification.id,
    eventType: notification.event_type,
    title: notification.title,
    body: notification.body,
    metadata: notification.metadata,
    timestamp: jstNow(),
  });

  const results = await Promise.allSettled(
    webhooks.map(async (wh) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (wh.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(wh.secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        const hexSignature = Array.from(new Uint8Array(signature))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        headers['X-Webhook-Signature'] = hexSignature;
      }

      const res = await fetch(wh.url, { method: 'POST', headers, body: payload });
      if (!res.ok) {
        throw new Error(`Webhook ${wh.id} returned ${res.status}`);
      }
    }),
  );

  const anyFailed = results.some((r) => r.status === 'rejected');
  if (anyFailed) {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason));
    console.error(`Webhook通知 id=${notification.id} 一部失敗:`, errors);
  }

  // 1つでも成功すればsentとする
  const anySent = results.some((r) => r.status === 'fulfilled');
  await updateNotificationStatus(db, notification.id, anySent ? 'sent' : 'failed');
}
