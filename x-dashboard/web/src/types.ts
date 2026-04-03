export type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'posted';

export interface Post {
  id: string;
  content: string;
  media_urls: string | null;
  status: PostStatus;
  thread_id: string | null;
  thread_order: number;
  scheduled_at: string | null;
  posted_at: string | null;
  tweet_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricsSummary {
  total_impressions: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  post_count: number;
}

export interface PostMetric {
  id: string;
  content: string;
  posted_at: string;
  tweet_id: string;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
}

export interface FollowerPoint {
  count: number;
  recorded_at: string;
}
