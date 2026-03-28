export interface Env {
  DB: D1Database;
  KNOWLEDGE_DB: D1Database;
  ANTHROPIC_API_KEY: string;
  WP_URL: string;
  WP_USER: string;
  WP_APP_PASSWORD: string;
  API_KEY: string;
}

export interface Keyword {
  id: number;
  keyword: string;
  search_intent: string;
  status: 'pending' | 'generating' | 'generated' | 'posted' | 'published' | 'failed';
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: number;
  keyword_id: number;
  title: string;
  slug: string;
  meta_description: string;
  content: string;
  status: 'draft' | 'review' | 'approved' | 'posted' | 'published';
  wp_post_id: number | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

export interface WPPostResponse {
  id: number;
  link: string;
  status: string;
}

export interface CaseStudy {
  id: number;
  business_name: string;
  industry: string;
  challenge: string;
  solution: string;
  result: string;
  quote: string | null;
  metrics_json: string | null;
  is_anonymized: number;
  created_at: string;
}
