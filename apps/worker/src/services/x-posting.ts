import {
  getScheduledXPosts,
  updateXPostStatus,
  createXPostLog,
  getDailyPostCount,
  getRecentPostedContent,
  getPostRetryCount,
  jstNow,
} from '@line-crm/db';
import type { XPost } from '@line-crm/db';
import { XApiClient, XApiError } from '../lib/x-api.js';
import type { XApiConfig } from '../lib/x-api.js';

// ---------------------------------------------------------------------------
// Ban対策定数
// ---------------------------------------------------------------------------

/**
 * 日次投稿上限: 環境変数 X_MAX_DAILY_POSTS で制御（デフォルト3）
 * 問題なければ段階的に上げる: 3 → 8 → 15 → 20
 * X Free tier上限: 月1,500（1日50が理論値）
 */
const DEFAULT_MAX_DAILY_POSTS = 3;

/** 1回のcron実行で処理する最大投稿数 */
const MAX_POSTS_PER_RUN = 3;

/** 連続投稿間の最小ウェイト（ms） - Bot検出回避 */
const MIN_INTER_POST_DELAY = 30_000; // 30秒

/** 連続投稿間の最大ウェイト（ms） - ランダムジッター上限 */
const MAX_INTER_POST_DELAY = 120_000; // 2分

/** 1投稿あたりの最大リトライ回数 */
const MAX_RETRIES = 3;

/** コンテンツ類似度の閾値（0-1、この値以上で重複とみなす） */
const SIMILARITY_THRESHOLD = 0.8;

/** リトライ対象のHTTPステータスコード */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// メイン処理: スケジュール済み投稿の処理
// ---------------------------------------------------------------------------

export interface XPostingResult {
  processed: number;
  posted: number;
  failed: number;
  skipped: number;
  errors: Array<{ postId: string; error: string }>;
}

export async function processXPosting(
  db: D1Database,
  xConfig: XApiConfig,
  options?: { maxDailyPosts?: number },
): Promise<XPostingResult> {
  const result: XPostingResult = {
    processed: 0,
    posted: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // --- Ban対策1: 日次投稿上限チェック（環境変数で制御） ---
  const maxDailyPosts = options?.maxDailyPosts ?? DEFAULT_MAX_DAILY_POSTS;
  const dailyCount = await getDailyPostCount(db);
  if (dailyCount >= maxDailyPosts) {
    console.log(`[x-posting] Daily limit reached (${dailyCount}/${maxDailyPosts}). Skipping.`);
    return result;
  }

  const remainingToday = maxDailyPosts - dailyCount;

  // 1. 投稿予定を取得（scheduled_at <= 現在時刻 のもの）
  const scheduledPosts = await getScheduledXPosts(db);

  if (scheduledPosts.length === 0) {
    return result;
  }

  // 今回処理する件数 = min(MAX_POSTS_PER_RUN, 残り日次上限, 予定件数)
  const batchSize = Math.min(MAX_POSTS_PER_RUN, remainingToday, scheduledPosts.length);
  const postsToProcess = scheduledPosts.slice(0, batchSize);

  // --- Ban対策2: 直近投稿の内容を取得（重複チェック用） ---
  const recentContent = await getRecentPostedContent(db, 50);

  const client = new XApiClient(xConfig);

  for (let i = 0; i < postsToProcess.length; i++) {
    const post = postsToProcess[i];
    result.processed++;

    try {
      // --- Ban対策3: リトライ上限チェック ---
      const retryCount = await getPostRetryCount(db, post.id);
      if (retryCount >= MAX_RETRIES) {
        await updateXPostStatus(db, post.id, 'failed', undefined, `Max retries exceeded (${MAX_RETRIES})`);
        await createXPostLog(db, post.id, 'failed', `Exceeded max retry count of ${MAX_RETRIES}. Giving up.`);
        result.failed++;
        result.errors.push({ postId: post.id, error: 'Max retries exceeded' });
        continue;
      }

      // --- Ban対策4: コンテンツ重複チェック ---
      if (isDuplicateContent(post.content, recentContent)) {
        await updateXPostStatus(db, post.id, 'failed', undefined, 'Duplicate content detected');
        await createXPostLog(db, post.id, 'skipped_duplicate', 'Content too similar to recent posts. Skipped to avoid spam detection.');
        result.skipped++;
        continue;
      }

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

      // 投稿済みコンテンツリストに追加（以降の重複チェック用）
      recentContent.unshift(post.content);

      result.posted++;
    } catch (error) {
      // 5. 失敗処理
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = error instanceof XApiError && RETRYABLE_STATUSES.has(error.status);

      // --- Ban対策5: 429(Rate Limit)の場合は即座に処理を中断 ---
      if (error instanceof XApiError && error.status === 429) {
        await updateXPostStatus(db, post.id, 'scheduled', undefined, errorMessage);
        await createXPostLog(db, post.id, 'rate_limited', `Rate limited. Stopping batch. ${errorMessage}`);
        result.failed++;
        result.errors.push({ postId: post.id, error: errorMessage });
        // 残りの投稿も処理しない
        break;
      }

      if (isRetryable) {
        await updateXPostStatus(db, post.id, 'scheduled', undefined, errorMessage);
        await createXPostLog(
          db,
          post.id,
          'retry_scheduled',
          `Retryable error (${(error as XApiError).status}): ${errorMessage}`,
        );
      } else {
        await updateXPostStatus(db, post.id, 'failed', undefined, errorMessage);
        await createXPostLog(db, post.id, 'failed', `Non-retryable error: ${errorMessage}`);
      }

      result.failed++;
      result.errors.push({ postId: post.id, error: errorMessage });
    }

    // --- Ban対策6: ランダムジッター付きウェイト（Bot検出回避） ---
    if (i < postsToProcess.length - 1) {
      const delay = randomDelay(MIN_INTER_POST_DELAY, MAX_INTER_POST_DELAY);
      await sleep(delay);
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
    const texts = post.content
      .split('---')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (texts.length <= 1) {
      return client.createTweet(post.content);
    }

    const results = await client.createThread(texts);
    return results[0];
  }

  if (post.post_type === 'reply' && post.thread_parent_id) {
    return client.createTweet(post.content, {
      replyToId: post.thread_parent_id,
    });
  }

  return client.createTweet(post.content);
}

// ---------------------------------------------------------------------------
// Ban対策ユーティリティ
// ---------------------------------------------------------------------------

/** コンテンツの重複チェック（簡易的なJaccard類似度） */
function isDuplicateContent(content: string, recentContents: string[]): boolean {
  const contentTokens = tokenize(content);

  for (const recent of recentContents) {
    const recentTokens = tokenize(recent);
    const similarity = jaccardSimilarity(contentTokens, recentTokens);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/** テキストをトークンに分割（日本語対応: 2-gram） */
function tokenize(text: string): Set<string> {
  // URL, 改行, 空白を除去してからトークン化
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  const tokens = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) {
    tokens.add(cleaned.slice(i, i + 2));
  }
  return tokens;
}

/** Jaccard類似度 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** ランダム遅延（min-max ms） */
function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
