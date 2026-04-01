import { getXPosts, createXPostLog } from '@line-crm/db';
import { XApiClient, XApiError } from '../lib/x-api.js';
import type { XApiConfig } from '../lib/x-api.js';

/** 1投稿間の待機時間（ms） */
const INTER_TRACK_DELAY = 1_000;

export interface EngagementTrackResult {
  tracked: number;
  failed: number;
  errors: Array<{ postId: string; error: string }>;
}

/**
 * 投稿済みXポストのエンゲージメント（いいね・RT・インプ）を取得してD1に記録する。
 */
export async function trackEngagement(
  db: D1Database,
  xConfig: XApiConfig,
): Promise<EngagementTrackResult> {
  const result: EngagementTrackResult = { tracked: 0, failed: 0, errors: [] };

  // status='posted' かつ x_post_id がある最新20件を取得
  const allPosted = await getXPosts(db, { status: 'posted', limit: 20 });
  const posts = allPosted.filter((p) => p.x_post_id !== null);

  if (posts.length === 0) {
    return result;
  }

  const client = new XApiClient(xConfig);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const xPostId = post.x_post_id as string;

    try {
      const tweet = await client.getTweet(xPostId);
      const { like_count, retweet_count, reply_count, impression_count } =
        tweet.public_metrics;

      await createXPostLog(
        db,
        post.id,
        'engagement_tracked',
        JSON.stringify({
          likes: like_count,
          retweets: retweet_count,
          replies: reply_count,
          impressions: impression_count,
        }),
      );

      result.tracked++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.failed++;
      result.errors.push({ postId: post.id, error: errorMessage });

      // 429: Rate Limit → 即中断
      if (error instanceof XApiError && error.status === 429) {
        break;
      }
    }

    // Rate limit対策: 投稿間に1秒待機（最後は不要）
    if (i < posts.length - 1) {
      await sleep(INTER_TRACK_DELAY);
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
