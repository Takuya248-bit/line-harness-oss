import {
  getScheduledXPosts,
  updateXPostStatus,
  createXPostLog,
  jstNow,
} from '@line-crm/db';
import type { XPost } from '@line-crm/db';
import { XApiClient, XApiError } from '../lib/x-api.js';
import type { XApiConfig } from '../lib/x-api.js';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 1回のcron実行で処理する最大投稿数（レート制限回避） */
const MAX_POSTS_PER_RUN = 5;

/** 連続投稿間のウェイト（ms） */
const INTER_POST_DELAY = 2000;

/** リトライ対象のHTTPステータスコード */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// メイン処理: スケジュール済み投稿の処理
// ---------------------------------------------------------------------------

export interface XPostingResult {
  processed: number;
  posted: number;
  failed: number;
  errors: Array<{ postId: string; error: string }>;
}

export async function processXPosting(
  db: D1Database,
  xConfig: XApiConfig,
): Promise<XPostingResult> {
  const result: XPostingResult = {
    processed: 0,
    posted: 0,
    failed: 0,
    errors: [],
  };

  // 1. 投稿予定を取得（scheduled_at <= 現在時刻 のもの）
  const scheduledPosts = await getScheduledXPosts(db);

  if (scheduledPosts.length === 0) {
    return result;
  }

  // レート制限を考慮して上限を設定
  const postsToProcess = scheduledPosts.slice(0, MAX_POSTS_PER_RUN);
  const client = new XApiClient(xConfig);

  for (let i = 0; i < postsToProcess.length; i++) {
    const post = postsToProcess[i];
    result.processed++;

    try {
      // 2. ステータスを「posting」に更新（二重投稿防止）
      await updateXPostStatus(db, post.id, 'posting');
      await createXPostLog(db, post.id, 'posting_started', `Attempting to post at ${jstNow()}`);

      // 3. X APIで投稿
      const postResult = await postToX(client, post);

      // 4. 成功: status=posted, x_post_id記録
      await updateXPostStatus(db, post.id, 'posted', postResult.id);
      await createXPostLog(
        db,
        post.id,
        'posted',
        `Successfully posted. X post ID: ${postResult.id}`,
      );

      result.posted++;
    } catch (error) {
      // 5. 失敗: status=failed (or scheduled for retry), error_message記録
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = error instanceof XApiError && RETRYABLE_STATUSES.has(error.status);

      if (isRetryable) {
        // リトライ可能なエラー: scheduledに戻して次回のcronで再試行
        await updateXPostStatus(db, post.id, 'scheduled', undefined, errorMessage);
        await createXPostLog(
          db,
          post.id,
          'retry_scheduled',
          `Retryable error (${(error as XApiError).status}): ${errorMessage}`,
        );
      } else {
        // リトライ不可: failedにする
        await updateXPostStatus(db, post.id, 'failed', undefined, errorMessage);
        await createXPostLog(db, post.id, 'failed', `Non-retryable error: ${errorMessage}`);
      }

      result.failed++;
      result.errors.push({ postId: post.id, error: errorMessage });
    }

    // 連続投稿間のウェイト（最後の投稿後は不要）
    if (i < postsToProcess.length - 1) {
      await sleep(INTER_POST_DELAY);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// X API 投稿処理
// ---------------------------------------------------------------------------

async function postToX(
  client: XApiClient,
  post: XPost,
): Promise<{ id: string; text: string }> {
  if (post.post_type === 'thread' && post.content.includes('---')) {
    // スレッド投稿: "---" で区切られたテキストを連投
    const texts = post.content
      .split('---')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (texts.length <= 1) {
      return client.createTweet(post.content);
    }

    const results = await client.createThread(texts);
    // 最初のツイートのIDを返す
    return results[0];
  }

  if (post.post_type === 'reply' && post.thread_parent_id) {
    // リプライ投稿
    return client.createTweet(post.content, {
      replyToId: post.thread_parent_id,
    });
  }

  // 単独投稿
  return client.createTweet(post.content);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
