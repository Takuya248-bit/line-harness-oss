export type ContentType = "carousel" | "reel";

export type ReelFormat =
  | "bali_tips"
  | "english_phrase"
  | "bali_english"
  | "bali_life"
  | "relatable";

export type HookStyle = "question" | "assertion" | "number_first" | "pov";

export interface ReelPlan {
  hookText: string;
  facts: string[];
  narrationTexts: string[];
  ctaText: string;
  reelFormat: ReelFormat;
  hookStyle: HookStyle;
}

export interface PipelineConfig {
  groqApiKey: string;
  notionApiKey: string;
  notionKnowledgeDbId: string;
  notionBuzzFormatsDbId: string;
  r2Bucket: R2Bucket;
  r2PublicUrl: string;
  db: D1Database;
}

export interface NetaEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  reliability: "firsthand" | "verified" | "unverified";
  source: string;
}

export interface ContentPlan {
  contentType: ContentType;
  formatName: string;
  category: string;
  hook: string;
  slides: SlideContent[];
  ctaText: string;
  neta: NetaEntry[];
}

export interface SlideContent {
  heading: string;
  body: string;
  icon?: string;
  slideType: "cover" | "point" | "summary" | "cta";
}

export interface GeneratedPost {
  contentType: ContentType;
  mediaUrls: string[];
  caption: string;
  contentJson: string;
  abTestMeta: ABTestMeta;
}

export interface ABTestMeta {
  contentType: ContentType;
  testWeek: string;
  testAxis: string;
  testVariant: string;
  isControl: boolean;
}

export interface PostInsights {
  queueId: number;
  igMediaId: string;
  reach: number;
  saves: number;
  shares: number;
  profileVisits: number;
  saveRate: number;
  shareRate: number;
}

export interface WeeklyReport {
  week: string;
  lineRegistrations: number;
  totalReach: number;
  avgSaveRate: number;
  avgShareRate: number;
  profileVisits: number;
  bottleneck: "awareness" | "evaluation" | "interest" | "action";
  abTestResult: {
    axis: string;
    winner: string | null;
    controlRate: number;
    testRate: number;
  } | null;
  nextTestAxis: string;
  nextTestVariant: string;
}
