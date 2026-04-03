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

export interface Metric {
  id: number;
  post_id: string;
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  collected_at: string;
}

export interface FollowerHistory {
  id: number;
  count: number;
  recorded_at: string;
}

export type UserRole = 'admin' | 'client';

export interface Env {
  DB: D1Database;
  ADMIN_EMAIL: string;
}
