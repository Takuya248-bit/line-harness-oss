export type Format = "education" | "emotion" | "numbers" | "daily";
export type VisualStyle = "bright" | "chic" | "handwritten" | "cinematic";
export type Target = "study_abroad" | "english_learner" | "bali_traveler";
export type ContentType = "feed" | "reel";

export interface Pattern {
  patternId: string; // 例: "education_bright_study_abroad"
  format: Format;
  visualStyle: VisualStyle;
  target: Target;
}

export interface Topic {
  id: string;
  title: string;
  body: string;
  source: "d1" | "notion";
}

export interface GeneratedText {
  caption: string;
  script: string;       // リール台本
  hashtags: string;     // スペース区切り
  imagePrompt: string;  // ComfyUI向け英語プロンプト
  videoPrompt: string;  // ComfyUI向け英語プロンプト
}

export interface GeneratedContent {
  id: string;
  topicId: string;
  patternId: string;
  contentType: ContentType;
  caption: string;
  script: string;
  hashtags: string;
  imageR2Key: string | null;
  videoR2Key: string | null;
  status: "pending_review" | "approved_auto" | "rejected_auto" | "rejected_human" | "posted";
  createdAt: string;
}

export interface NightbatchConfig {
  // Cloudflare
  cfAccountId: string;
  cfApiToken: string;
  d1DatabaseId: string;
  r2BucketName: string;
  // Notion
  notionApiKey: string;
  notionDatabaseId: string;
  // Ollama
  ollamaBaseUrl: string; // 例: "http://localhost:11434"
  ollamaModel: string;   // 例: "gemma3:12b"
  // ComfyUI
  comfyuiBaseUrl: string; // 例: "http://localhost:8188"
  // バッチ設定
  topicsPerRun: number;       // 1夜に処理するネタ数
  patternsPerTopic: number;   // 1ネタあたり生成パターン数
}

export interface ReviewResult {
  score: number;           // 0-100
  breakdown: {
    hook_strength: number;
    target_fit: number;
    authenticity: number;
    cta_clarity: number;
  };
  reason: string;          // 採点理由（1行）
  mode: "rubric" | "rag";  // 評価モード
}
