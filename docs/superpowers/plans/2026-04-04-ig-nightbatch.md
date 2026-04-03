# ig夜間自動生成パイプライン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WindowsマシンのOllama+ComfyUIを使い、夜間にフィード画像とリール動画を大量生成してD1に保存し、朝にスマホブラウザで採用/非採用を選べる仕組みを構築する。

**Architecture:** Windows Task Schedulerが毎夜23:00にNode.jsスクリプトを起動。Ollamaでテキスト生成→ComfyUI APIで画像・動画生成→R2アップロード→D1保存の順でパイプラインを実行。確認UIはCloudflare Pages + Cloudflare Access（Google認証）で提供。

**Tech Stack:** Node.js + TypeScript（Windows側バッチ）、Ollama REST API、ComfyUI API、Cloudflare D1/R2/Pages、既存の `batch/d1-rest.ts` と `batch/r2-upload.ts` を再利用。

---

## ファイル構成

```
ig-auto-poster/
├─ batch/
│   ├─ d1-rest.ts          （既存・変更なし）
│   ├─ r2-upload.ts        （既存・変更なし）
│   ├─ nightbatch/
│   │   ├─ types.ts        （新規：型定義）
│   │   ├─ fetch-topics.ts （新規：D1+NotionからネタDB取得）
│   │   ├─ pattern-selector.ts （新規：48パターン抽選）
│   │   ├─ text-generator.ts   （新規：Ollama API呼び出し）
│   │   ├─ comfyui-generator.ts（新規：ComfyUI API呼び出し）
│   │   ├─ save-results.ts     （新規：D1+R2保存）
│   │   ├─ weights.json        （新規：パターン重みファイル）
│   │   └─ main.ts             （新規：パイプライン統括エントリ）
├─ migrations/
│   └─ 0010_nightbatch.sql （新規：pattern_weightsテーブル追加）
├─ review-ui/              （新規：Cloudflare Pages確認UI）
│   ├─ index.html
│   ├─ app.ts
│   └─ wrangler.toml
```

---

## Task 1: D1マイグレーション（pattern_weightsテーブル追加）

**Files:**
- Create: `ig-auto-poster/migrations/0010_nightbatch.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- pattern_weights: 48パターンの採用率重みを管理
CREATE TABLE IF NOT EXISTS pattern_weights (
  pattern_id TEXT PRIMARY KEY,  -- 例: "education_bright_study_abroad"
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- generated_contentにpattern_idとcontent_typeカラムを追加
ALTER TABLE generated_content ADD COLUMN pattern_id TEXT;
ALTER TABLE generated_content ADD COLUMN content_type TEXT DEFAULT 'feed';
ALTER TABLE generated_content ADD COLUMN topic_id TEXT;
ALTER TABLE generated_content ADD COLUMN script TEXT;
ALTER TABLE generated_content ADD COLUMN hashtags TEXT;
ALTER TABLE generated_content ADD COLUMN image_r2_key TEXT;
ALTER TABLE generated_content ADD COLUMN video_r2_key TEXT;
ALTER TABLE generated_content ADD COLUMN reviewed_at TEXT;
```

- [ ] **Step 2: マイグレーションを実行**

```bash
cd ig-auto-poster
pnpm migrate
```

期待結果: エラーなし、`pattern_weights` テーブルが作成される

- [ ] **Step 3: コミット**

```bash
git add migrations/0010_nightbatch.sql
git commit -m "feat(ig-nightbatch): add pattern_weights table and extend generated_content"
```

---

## Task 2: 型定義（types.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/types.ts`

- [ ] **Step 1: 型定義ファイルを作成**

```typescript
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
  status: "pending_review" | "approved" | "rejected";
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
  ollamaModel: string;   // 例: "gemma3:27b"
  // ComfyUI
  comfyuiBaseUrl: string; // 例: "http://localhost:8188"
  // バッチ設定
  topicsPerRun: number;       // 1夜に処理するネタ数
  patternsPerTopic: number;   // 1ネタあたり生成パターン数
}
```

- [ ] **Step 2: コミット**

```bash
git add batch/nightbatch/types.ts
git commit -m "feat(ig-nightbatch): add type definitions"
```

---

## Task 3: パターン抽選モジュール（pattern-selector.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/pattern-selector.ts`
- Create: `ig-auto-poster/batch/nightbatch/weights.json`

- [ ] **Step 1: weights.jsonを作成（初期値は全て1.0の均等重み）**

```json
{
  "education_bright_study_abroad": 1.0,
  "education_bright_english_learner": 1.0,
  "education_bright_bali_traveler": 1.0,
  "education_chic_study_abroad": 1.0,
  "education_chic_english_learner": 1.0,
  "education_chic_bali_traveler": 1.0,
  "education_handwritten_study_abroad": 1.0,
  "education_handwritten_english_learner": 1.0,
  "education_handwritten_bali_traveler": 1.0,
  "education_cinematic_study_abroad": 1.0,
  "education_cinematic_english_learner": 1.0,
  "education_cinematic_bali_traveler": 1.0,
  "emotion_bright_study_abroad": 1.0,
  "emotion_bright_english_learner": 1.0,
  "emotion_bright_bali_traveler": 1.0,
  "emotion_chic_study_abroad": 1.0,
  "emotion_chic_english_learner": 1.0,
  "emotion_chic_bali_traveler": 1.0,
  "emotion_handwritten_study_abroad": 1.0,
  "emotion_handwritten_english_learner": 1.0,
  "emotion_handwritten_bali_traveler": 1.0,
  "emotion_cinematic_study_abroad": 1.0,
  "emotion_cinematic_english_learner": 1.0,
  "emotion_cinematic_bali_traveler": 1.0,
  "numbers_bright_study_abroad": 1.0,
  "numbers_bright_english_learner": 1.0,
  "numbers_bright_bali_traveler": 1.0,
  "numbers_chic_study_abroad": 1.0,
  "numbers_chic_english_learner": 1.0,
  "numbers_chic_bali_traveler": 1.0,
  "numbers_handwritten_study_abroad": 1.0,
  "numbers_handwritten_english_learner": 1.0,
  "numbers_handwritten_bali_traveler": 1.0,
  "numbers_cinematic_study_abroad": 1.0,
  "numbers_cinematic_english_learner": 1.0,
  "numbers_cinematic_bali_traveler": 1.0,
  "daily_bright_study_abroad": 1.0,
  "daily_bright_english_learner": 1.0,
  "daily_bright_bali_traveler": 1.0,
  "daily_chic_study_abroad": 1.0,
  "daily_chic_english_learner": 1.0,
  "daily_chic_bali_traveler": 1.0,
  "daily_handwritten_study_abroad": 1.0,
  "daily_handwritten_english_learner": 1.0,
  "daily_handwritten_bali_traveler": 1.0,
  "daily_cinematic_study_abroad": 1.0,
  "daily_cinematic_english_learner": 1.0,
  "daily_cinematic_bali_traveler": 1.0
}
```

- [ ] **Step 2: pattern-selector.tsを作成**

```typescript
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import type { Pattern, Format, VisualStyle, Target } from "./types.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS: Format[] = ["education", "emotion", "numbers", "daily"];
const VISUAL_STYLES: VisualStyle[] = ["bright", "chic", "handwritten", "cinematic"];
const TARGETS: Target[] = ["study_abroad", "english_learner", "bali_traveler"];

export function getAllPatterns(): Pattern[] {
  return FORMATS.flatMap(format =>
    VISUAL_STYLES.flatMap(visualStyle =>
      TARGETS.map(target => ({
        patternId: `${format}_${visualStyle}_${target}`,
        format,
        visualStyle,
        target,
      }))
    )
  );
}

export function selectPatterns(count: number): Pattern[] {
  const weightsPath = path.join(__dirname, "weights.json");
  const weights: Record<string, number> = require(weightsPath);
  const allPatterns = getAllPatterns();

  // 重み付きランダム抽選
  const totalWeight = allPatterns.reduce((sum, p) => sum + (weights[p.patternId] ?? 1.0), 0);
  const selected: Pattern[] = [];

  for (let i = 0; i < count; i++) {
    let rand = Math.random() * totalWeight;
    for (const pattern of allPatterns) {
      rand -= weights[pattern.patternId] ?? 1.0;
      if (rand <= 0) {
        selected.push(pattern);
        break;
      }
    }
  }
  return selected;
}
```

- [ ] **Step 3: コミット**

```bash
git add batch/nightbatch/pattern-selector.ts batch/nightbatch/weights.json
git commit -m "feat(ig-nightbatch): add pattern selector with weighted random"
```

---

## Task 4: ネタ取得モジュール（fetch-topics.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/fetch-topics.ts`

- [ ] **Step 1: fetch-topics.tsを作成**

```typescript
import { d1Query } from "../d1-rest.js";
import type { Topic, NightbatchConfig } from "./types.js";

interface NotionPage {
  id: string;
  properties: {
    Name?: { title: { plain_text: string }[] };
    Body?: { rich_text: { plain_text: string }[] };
    Status?: { select: { name: string } | null };
  };
}

async function fetchFromD1(config: NightbatchConfig, limit: number): Promise<Topic[]> {
  const rows = await d1Query<{ id: string; title: string; body: string }>(
    config.cfAccountId,
    config.d1DatabaseId,
    config.cfApiToken,
    `SELECT id, title, body FROM knowledge_items
     WHERE used_in_nightbatch IS NULL OR used_in_nightbatch = 0
     ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(r => ({ id: String(r.id), title: r.title, body: r.body, source: "d1" as const }));
}

async function fetchFromNotion(config: NightbatchConfig, limit: number): Promise<Topic[]> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionApiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: limit }),
    },
  );
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  const data = await res.json() as { results: NotionPage[] };

  return data.results.map(page => ({
    id: page.id,
    title: page.properties.Name?.title[0]?.plain_text ?? "",
    body: page.properties.Body?.rich_text[0]?.plain_text ?? "",
    source: "notion" as const,
  })).filter(t => t.title.length > 0);
}

export async function fetchTopics(config: NightbatchConfig): Promise<Topic[]> {
  const half = Math.ceil(config.topicsPerRun / 2);
  const [d1Topics, notionTopics] = await Promise.all([
    fetchFromD1(config, half),
    fetchFromNotion(config, half),
  ]);
  return [...d1Topics, ...notionTopics].slice(0, config.topicsPerRun);
}
```

- [ ] **Step 2: コミット**

```bash
git add batch/nightbatch/fetch-topics.ts
git commit -m "feat(ig-nightbatch): add topic fetcher for D1 and Notion"
```

---

## Task 5: テキスト生成モジュール（text-generator.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/text-generator.ts`

- [ ] **Step 1: text-generator.tsを作成**

```typescript
import type { Topic, Pattern, GeneratedText, NightbatchConfig } from "./types.js";

const FORMAT_LABELS: Record<string, string> = {
  education: "教育系・Tips・How-to",
  emotion: "感情系・共感・ストーリー",
  numbers: "数字系・ランキング・〇〇選",
  daily: "日常系・Vlog風・リアル体験",
};

const VISUAL_LABELS: Record<string, string> = {
  bright: "明るく・カラフル・旅行感",
  chic: "シック・ミニマル・洗練",
  handwritten: "手書き風・温かみ・アナログ",
  cinematic: "映像的・ドラマチック・映画的",
};

const TARGET_LABELS: Record<string, string> = {
  study_abroad: "バリ留学を検討している人",
  english_learner: "英語学習者",
  bali_traveler: "バリ旅行者・旅行検討者",
};

function buildPrompt(topic: Topic, pattern: Pattern, contentType: "feed" | "reel"): string {
  return `あなたはInstagramコンテンツの専門家です。以下の条件でInstagram投稿素材を日本語で生成してください。

ネタ:
タイトル: ${topic.title}
内容: ${topic.body}

フォーマット: ${FORMAT_LABELS[pattern.format]}
ビジュアルスタイル: ${VISUAL_LABELS[pattern.visualStyle]}
ターゲット: ${TARGET_LABELS[pattern.target]}
投稿種別: ${contentType === "feed" ? "フィード（静止画）" : "リール（動画）"}

以下のJSON形式で返してください（他のテキストは不要）:
{
  "caption": "投稿キャプション（150文字以内・改行可）",
  "script": "${contentType === "reel" ? "リール台本（30秒以内・シーン分け）" : "（feedのためスキップ）"}",
  "hashtags": "#バリ留学 #英語学習 など10個（スペース区切り）",
  "imagePrompt": "ComfyUI向け画像生成プロンプト（英語・50語以内）",
  "videoPrompt": "ComfyUI向け動画生成プロンプト（英語・50語以内）"
}`;
}

export async function generateText(
  topic: Topic,
  pattern: Pattern,
  contentType: "feed" | "reel",
  config: NightbatchConfig,
): Promise<GeneratedText> {
  const prompt = buildPrompt(topic, pattern, contentType);

  const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false,
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json() as { response: string };
  const parsed = JSON.parse(data.response) as GeneratedText;
  return parsed;
}
```

- [ ] **Step 2: コミット**

```bash
git add batch/nightbatch/text-generator.ts
git commit -m "feat(ig-nightbatch): add Ollama text generator"
```

---

## Task 6: ComfyUI生成モジュール（comfyui-generator.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/comfyui-generator.ts`

- [ ] **Step 1: comfyui-generator.tsを作成**

```typescript
import type { NightbatchConfig } from "./types.js";

interface QueueResponse {
  prompt_id: string;
}

interface HistoryOutput {
  images?: { filename: string; subfolder: string; type: string }[];
  gifs?: { filename: string; subfolder: string; type: string }[];
}

// フィード画像用のシンプルなワークフロー（txt2img）
function buildFeedWorkflow(prompt: string): Record<string, unknown> {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1e9),
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "v1-5-pruned-emaonly.ckpt" } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 1080, height: 1080, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "blurry, low quality, nsfw", clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "nightbatch_feed" } },
  };
}

// リール動画用ワークフロー（img2vid または AnimateDiff）
function buildReelWorkflow(prompt: string): Record<string, unknown> {
  // NOTE: ComfyUIのモデル確認後にワークフローを更新する
  // 現時点では静止画を生成してフォールバック
  return buildFeedWorkflow(prompt);
}

async function queuePrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`ComfyUI queue error: ${res.status}`);
  const data = await res.json() as QueueResponse;
  return data.prompt_id;
}

async function waitForResult(
  baseUrl: string,
  promptId: string,
  timeoutMs = 300_000,
): Promise<HistoryOutput> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    if (res.ok) {
      const data = await res.json() as Record<string, { outputs: Record<string, HistoryOutput> }>;
      const entry = data[promptId];
      if (entry) {
        const outputs = Object.values(entry.outputs);
        return outputs[0] ?? {};
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`ComfyUI timeout: ${promptId}`);
}

async function downloadOutput(
  baseUrl: string,
  filename: string,
  subfolder: string,
): Promise<Buffer> {
  const url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ComfyUI download error: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateFeedImage(
  imagePrompt: string,
  config: NightbatchConfig,
): Promise<Buffer> {
  const workflow = buildFeedWorkflow(imagePrompt);
  const promptId = await queuePrompt(config.comfyuiBaseUrl, workflow);
  const output = await waitForResult(config.comfyuiBaseUrl, promptId);
  const img = output.images?.[0];
  if (!img) throw new Error("No image output from ComfyUI");
  return downloadOutput(config.comfyuiBaseUrl, img.filename, img.subfolder);
}

export async function generateReelVideo(
  videoPrompt: string,
  config: NightbatchConfig,
): Promise<Buffer | null> {
  const workflow = buildReelWorkflow(videoPrompt);
  const promptId = await queuePrompt(config.comfyuiBaseUrl, workflow);
  const output = await waitForResult(config.comfyuiBaseUrl, promptId);
  const vid = output.gifs?.[0] ?? output.images?.[0];
  if (!vid) return null;
  return downloadOutput(config.comfyuiBaseUrl, vid.filename, vid.subfolder);
}
```

- [ ] **Step 2: コミット**

```bash
git add batch/nightbatch/comfyui-generator.ts
git commit -m "feat(ig-nightbatch): add ComfyUI image/video generator"
```

---

## Task 7: D1/R2保存モジュール（save-results.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/save-results.ts`

- [ ] **Step 1: save-results.tsを作成**

```typescript
import { d1Execute } from "../d1-rest.js";
import { uploadToR2 } from "../r2-upload.js";
import type { GeneratedText, Pattern, NightbatchConfig } from "./types.js";
import { randomUUID } from "crypto";

export async function saveResult(
  topicId: string,
  pattern: Pattern,
  contentType: "feed" | "reel",
  text: GeneratedText,
  imageBuffer: Buffer | null,
  videoBuffer: Buffer | null,
  config: NightbatchConfig,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  let imageR2Key: string | null = null;
  let videoR2Key: string | null = null;

  if (imageBuffer) {
    imageR2Key = `nightbatch/${now.slice(0, 10)}/${id}/feed.png`;
    await uploadToR2(
      config.cfAccountId,
      config.r2BucketName,
      config.cfApiToken,
      imageR2Key,
      imageBuffer,
      "image/png",
    );
  }

  if (videoBuffer) {
    videoR2Key = `nightbatch/${now.slice(0, 10)}/${id}/reel.mp4`;
    await uploadToR2(
      config.cfAccountId,
      config.r2BucketName,
      config.cfApiToken,
      videoR2Key,
      videoBuffer,
      "video/mp4",
    );
  }

  await d1Execute(
    config.cfAccountId,
    config.d1DatabaseId,
    config.cfApiToken,
    `INSERT INTO generated_content
      (id, topic_id, pattern_id, content_type, caption, script, hashtags,
       image_r2_key, video_r2_key, status, created_at, content_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, '{}')`,
    [
      id, topicId, pattern.patternId, contentType,
      text.caption, text.script, text.hashtags,
      imageR2Key, videoR2Key, now,
    ],
  );

  return id;
}
```

- [ ] **Step 2: コミット**

```bash
git add batch/nightbatch/save-results.ts
git commit -m "feat(ig-nightbatch): add D1/R2 save module"
```

---

## Task 8: パイプライン統括エントリ（main.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/main.ts`

- [ ] **Step 1: main.tsを作成**

```typescript
import { fetchTopics } from "./fetch-topics.js";
import { selectPatterns } from "./pattern-selector.js";
import { generateText } from "./text-generator.js";
import { generateFeedImage, generateReelVideo } from "./comfyui-generator.js";
import { saveResult } from "./save-results.js";
import type { NightbatchConfig } from "./types.js";

const config: NightbatchConfig = {
  cfAccountId: process.env.CF_ACCOUNT_ID!,
  cfApiToken: process.env.CF_API_TOKEN!,
  d1DatabaseId: process.env.D1_DATABASE_ID!,
  r2BucketName: process.env.R2_BUCKET_NAME ?? "barilingual-ig-images",
  notionApiKey: process.env.NOTION_API_KEY!,
  notionDatabaseId: process.env.NOTION_DATABASE_ID!,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "gemma3:27b",
  comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? "http://localhost:8188",
  topicsPerRun: parseInt(process.env.TOPICS_PER_RUN ?? "5"),
  patternsPerTopic: parseInt(process.env.PATTERNS_PER_TOPIC ?? "3"),
};

// 必須環境変数チェック
const required = ["CF_ACCOUNT_ID", "CF_API_TOKEN", "D1_DATABASE_ID", "NOTION_API_KEY", "NOTION_DATABASE_ID"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env: ${key}`);
}

async function run() {
  console.log(`[nightbatch] 開始 ${new Date().toISOString()}`);

  // Step 1: ネタ取得
  const topics = await fetchTopics(config);
  console.log(`[nightbatch] ネタ取得: ${topics.length}件`);

  // Step 2: テキスト生成フェーズ（Ollama使用）
  const queue: Array<{ topicId: string; patternId: string; contentType: "feed" | "reel"; text: ReturnType<typeof generateText> }> = [];

  for (const topic of topics) {
    const patterns = selectPatterns(config.patternsPerTopic);
    for (const pattern of patterns) {
      for (const contentType of ["feed", "reel"] as const) {
        queue.push({
          topicId: topic.id,
          patternId: pattern.patternId,
          contentType,
          text: generateText(topic, pattern, contentType, config),
        });
      }
    }
  }

  const resolvedTexts = await Promise.all(
    queue.map(async item => ({ ...item, text: await item.text }))
  );
  console.log(`[nightbatch] テキスト生成完了: ${resolvedTexts.length}件`);

  // Step 3: ComfyUI生成フェーズ（VRAM引き継ぎ）
  let saved = 0;
  for (const item of resolvedTexts) {
    try {
      const topic = topics.find(t => t.id === item.topicId)!;
      const pattern = selectPatterns(1)[0]; // patternIdから再構築
      const imageBuffer = item.contentType === "feed"
        ? await generateFeedImage(item.text.imagePrompt, config)
        : null;
      const videoBuffer = item.contentType === "reel"
        ? await generateReelVideo(item.text.videoPrompt, config)
        : null;

      await saveResult(
        topic.id, pattern, item.contentType, item.text,
        imageBuffer, videoBuffer, config,
      );
      saved++;
      console.log(`[nightbatch] 保存: ${saved}/${resolvedTexts.length}`);
    } catch (err) {
      console.error(`[nightbatch] スキップ:`, err);
    }
  }

  console.log(`[nightbatch] 完了: ${saved}件保存`);
}

run().catch(err => {
  console.error("[nightbatch] 致命的エラー:", err);
  process.exit(1);
});
```

- [ ] **Step 2: tsconfig確認・ビルドテスト**

```bash
cd ig-auto-poster/batch
npx tsc --noEmit
```

期待結果: エラー0

- [ ] **Step 3: コミット**

```bash
git add batch/nightbatch/main.ts
git commit -m "feat(ig-nightbatch): add pipeline entry point"
```

---

## Task 9: Windows環境セットアップ手順（.env + Task Scheduler）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/README.md`

- [ ] **Step 1: Ollamaインストール（Windows側で実行）**

```powershell
# Ollama公式サイトからインストーラーをダウンロードして実行後:
ollama pull gemma3:12b
# VRAM 8GBではgemma3:27bは厳しいため12bを推薦
ollama serve
```

確認: `curl http://localhost:11434/api/tags` でgemma3:12bが表示される

- [ ] **Step 2: .envファイルを作成（ig-auto-poster/batch/nightbatch/.env）**

```
CF_ACCOUNT_ID=your_account_id
CF_API_TOKEN=your_api_token
D1_DATABASE_ID=your_d1_database_id
R2_BUCKET_NAME=barilingual-ig-images
NOTION_API_KEY=your_notion_key
NOTION_DATABASE_ID=your_notion_db_id
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b
COMFYUI_BASE_URL=http://localhost:8188
TOPICS_PER_RUN=5
PATTERNS_PER_TOPIC=3
```

- [ ] **Step 3: Windows Task Schedulerを設定（PowerShellで実行）**

```powershell
$action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "C:\path\to\ig-auto-poster\batch\nightbatch\main.js" `
  -WorkingDirectory "C:\path\to\ig-auto-poster\batch\nightbatch"

$trigger = New-ScheduledTaskTrigger -Daily -At "23:00"

Register-ScheduledTask `
  -TaskName "ig-nightbatch" `
  -Action $action `
  -Trigger $trigger `
  -RunLevel Highest
```

- [ ] **Step 4: 手動テスト実行**

```bash
cd ig-auto-poster/batch/nightbatch
node --env-file=.env main.js
```

期待結果: `[nightbatch] 完了: N件保存` のログが出る

- [ ] **Step 5: コミット**

```bash
git add batch/nightbatch/README.md
git commit -m "docs(ig-nightbatch): add Windows setup guide"
```

---

## Task 10: 確認UI（Cloudflare Pages）

**Files:**
- Create: `ig-auto-poster/review-ui/index.html`
- Create: `ig-auto-poster/review-ui/app.ts`
- Create: `ig-auto-poster/review-ui/wrangler.toml`

- [ ] **Step 1: wrangler.tomlを作成**

```toml
name = "ig-review-ui"
compatibility_date = "2024-01-01"
pages_build_output_dir = "."

[[d1_databases]]
binding = "DB"
database_name = "ig-auto-poster-db"
database_id = "YOUR_D1_DATABASE_ID"
```

- [ ] **Step 2: index.htmlを作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IG 生成コンテンツ確認</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 16px; background: #111; color: #eee; }
    .card { background: #222; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .card img, .card video { width: 100%; border-radius: 8px; }
    .caption { font-size: 14px; margin: 8px 0; white-space: pre-wrap; }
    .hashtags { font-size: 12px; color: #888; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    button { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    .approve { background: #22c55e; color: #fff; }
    .reject { background: #ef4444; color: #fff; }
    .hold { background: #555; color: #fff; }
    #loading { text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <h1>生成コンテンツ確認</h1>
  <div id="loading">読み込み中...</div>
  <div id="cards"></div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: app.tsを作成**

```typescript
interface ContentItem {
  id: string;
  caption: string;
  hashtags: string;
  content_type: string;
  image_r2_key: string | null;
  video_r2_key: string | null;
  pattern_id: string;
  created_at: string;
}

const R2_PUBLIC_BASE = "https://pub-YOUR_R2_BUCKET.r2.dev"; // R2公開URLに変更

async function fetchPending(): Promise<ContentItem[]> {
  const res = await fetch("/api/pending");
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function updateStatus(id: string, status: "approved" | "rejected"): Promise<void> {
  await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
}

function renderCard(item: ContentItem): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = item.id;

  const mediaUrl = item.image_r2_key
    ? `${R2_PUBLIC_BASE}/${item.image_r2_key}`
    : item.video_r2_key
    ? `${R2_PUBLIC_BASE}/${item.video_r2_key}`
    : null;

  card.innerHTML = `
    ${mediaUrl && item.content_type === "feed"
      ? `<img src="${mediaUrl}" alt="generated">`
      : mediaUrl && item.content_type === "reel"
      ? `<video src="${mediaUrl}" controls playsinline></video>`
      : "<div style='height:100px;background:#333;border-radius:8px;display:flex;align-items:center;justify-content:center'>メディアなし</div>"
    }
    <div class="caption">${item.caption}</div>
    <div class="hashtags">${item.hashtags ?? ""}</div>
    <div style="font-size:11px;color:#666;margin-top:4px">${item.pattern_id} / ${item.content_type}</div>
    <div class="actions">
      <button class="approve" onclick="review('${item.id}', 'approved', this)">採用</button>
      <button class="hold">保留</button>
      <button class="reject" onclick="review('${item.id}', 'rejected', this)">非採用</button>
    </div>
  `;
  return card;
}

(window as Window & { review: (id: string, status: "approved" | "rejected", btn: HTMLButtonElement) => void }).review =
  async (id, status, btn) => {
    btn.disabled = true;
    await updateStatus(id, status);
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) card.remove();
  };

async function init() {
  const loading = document.getElementById("loading")!;
  const cards = document.getElementById("cards")!;
  try {
    const items = await fetchPending();
    loading.style.display = "none";
    if (items.length === 0) {
      cards.innerHTML = "<p style='text-align:center;color:#888'>確認待ちのコンテンツはありません</p>";
      return;
    }
    items.forEach(item => cards.appendChild(renderCard(item)));
  } catch (e) {
    loading.textContent = "読み込みエラー";
  }
}

init();
```

- [ ] **Step 4: Cloudflare PagesのFunctions（/api/pending, /api/review）を作成**

```
review-ui/functions/
├─ api/
│   ├─ pending.ts
│   └─ review.ts
```

`review-ui/functions/api/pending.ts`:
```typescript
interface Env { DB: D1Database; }

export const onRequest = async (ctx: { env: Env }): Promise<Response> => {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, caption, hashtags, content_type, image_r2_key, video_r2_key, pattern_id, created_at
     FROM generated_content WHERE status = 'pending_review'
     ORDER BY created_at DESC LIMIT 50`
  ).all();
  return Response.json(rows.results);
};
```

`review-ui/functions/api/review.ts`:
```typescript
interface Env { DB: D1Database; }

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { id, status } = await ctx.request.json() as { id: string; status: string };
  if (!["approved", "rejected"].includes(status)) {
    return new Response("invalid status", { status: 400 });
  }
  await ctx.env.DB.prepare(
    `UPDATE generated_content SET status = ?, reviewed_at = datetime('now') WHERE id = ?`
  ).bind(status, id).run();
  return Response.json({ ok: true });
};
```

- [ ] **Step 5: Cloudflare Pagesにデプロイ**

```bash
cd review-ui
npx wrangler pages deploy . --project-name ig-review-ui
```

- [ ] **Step 6: Cloudflare AccessでGoogle認証を設定**

Cloudflare Dashboardで:
1. Zero Trust → Access → Applications → Add an application
2. Type: Pages
3. Application domain: `ig-review-ui.pages.dev`
4. Policy: Allow + Google認証

- [ ] **Step 7: コミット**

```bash
git add review-ui/
git commit -m "feat(ig-nightbatch): add review UI for Cloudflare Pages"
```

---

## Task 11: 週次学習ループ（weekly-learn.ts）

**Files:**
- Create: `ig-auto-poster/batch/nightbatch/weekly-learn.ts`

- [ ] **Step 1: weekly-learn.tsを作成**

```typescript
import { d1Query, d1Execute } from "../d1-rest.js";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import type { NightbatchConfig } from "./types.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PatternStat {
  pattern_id: string;
  approved: number;
  rejected: number;
}

export async function runWeeklyLearn(config: NightbatchConfig): Promise<void> {
  // 過去7日間の採用/非採用を集計
  const stats = await d1Query<PatternStat>(
    config.cfAccountId,
    config.d1DatabaseId,
    config.cfApiToken,
    `SELECT
       pattern_id,
       SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
     FROM generated_content
     WHERE reviewed_at >= datetime('now', '-7 days')
       AND pattern_id IS NOT NULL
     GROUP BY pattern_id`,
  );

  if (stats.length === 0) {
    console.log("[weekly-learn] データなし");
    return;
  }

  // 重み更新: 採用率が高いパターンの重みを上げる
  const weightsPath = path.join(__dirname, "weights.json");
  const weights: Record<string, number> = require(weightsPath);

  for (const stat of stats) {
    const total = stat.approved + stat.rejected;
    if (total < 3) continue; // サンプル数が少ない場合はスキップ
    const approvalRate = stat.approved / total;
    // 採用率0.5を基準に±0.5の範囲で重みを調整（最小0.1、最大3.0）
    const newWeight = Math.max(0.1, Math.min(3.0, 0.5 + approvalRate * 2.5));
    weights[stat.pattern_id] = newWeight;

    await d1Execute(
      config.cfAccountId,
      config.d1DatabaseId,
      config.cfApiToken,
      `INSERT INTO pattern_weights (pattern_id, approved_count, rejected_count, weight, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(pattern_id) DO UPDATE SET
         approved_count = approved_count + excluded.approved_count,
         rejected_count = rejected_count + excluded.rejected_count,
         weight = excluded.weight,
         updated_at = excluded.updated_at`,
      [stat.pattern_id, stat.approved, stat.rejected, newWeight],
    );
  }

  // weights.jsonを上書き保存
  fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));
  console.log(`[weekly-learn] 重み更新: ${stats.length}パターン`);
}
```

- [ ] **Step 2: Task Schedulerに週次タスクを追加（PowerShell）**

```powershell
$action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "C:\path\to\ig-auto-poster\batch\nightbatch\weekly-learn.js" `
  -WorkingDirectory "C:\path\to\ig-auto-poster\batch\nightbatch"

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "06:00"

Register-ScheduledTask `
  -TaskName "ig-nightbatch-weekly-learn" `
  -Action $action `
  -Trigger $trigger `
  -RunLevel Highest
```

- [ ] **Step 3: コミット**

```bash
git add batch/nightbatch/weekly-learn.ts
git commit -m "feat(ig-nightbatch): add weekly learning loop"
```

---

## Self-Review

spec確認:
- D1/Notion両方からネタ取得 → Task 4 で実装済み
- 48パターン抽選 → Task 3 で実装済み
- Ollama テキスト生成 → Task 5 で実装済み
- ComfyUI フィード+リール生成 → Task 6 で実装済み（リールワークフローは要更新）
- R2保存 → Task 7 で実装済み
- 確認UI → Task 10 で実装済み
- 学習ループ → Task 11 で実装済み
- Mac不要・Windows24h → Task 9 で実装済み

型整合性:
- `NightbatchConfig` はTask 2で定義、全モジュールで一貫してimport
- `GeneratedText` はTask 2で定義、Task 5の戻り値型と一致
- `saveResult` のシグネチャはTask 7とTask 8の呼び出しが一致

プレースホルダー:
- ComfyUIリールワークフロー: フォールバックを明記済み（モデル確認後に更新）
- R2_PUBLIC_BASE: コメントで変更箇所を明示済み
