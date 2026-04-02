# IG フィード投稿自動化 v4 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週次PDCAサイクル+A/Bテスト自動最適化でバリリンガルIG投稿を自動運用し、LINE登録100件/月を目指す

**Architecture:** GH Actionsで週次バッチ（ネタ収集→レポート→7投稿生成→LINE通知）、CF Workerで日次Cron投稿+承認API。Groq（無料）でテキスト生成、sharp（Node.js）で画像生成、D1でスケジュール+A/Bテスト管理。既存ig-auto-posterを段階的にv4に移行。

**Tech Stack:** TypeScript, Cloudflare Workers/D1/R2, sharp, Groq API (Llama 3.3-70B), IG Graph API, LINE Messaging API, GitHub Actions, vitest

**Spec:** `docs/superpowers/specs/2026-04-02-ig-feed-automation-v4-design.md`

---

## ファイル構成

既存 `ig-auto-poster/src/` を段階的にリファクタ。新規モジュールを追加し、旧モジュールは最終タスクで削除。

```
ig-auto-poster/
  src/
    pipeline/
      neta-collector.ts      # 新規: ネタ収集（RSS+IG Discovery+Groq抽象化/具体化）
      content-planner.ts     # 新規: 構成生成（Groq: フック+本文+CTA）
      media-generator.ts     # 新規: sharp画像生成（テキスト主体カルーセル）
      caption-writer.ts      # 新規: Groqキャプション生成
      scheduler.ts           # 新規: スケジュールキュー管理
      types.ts               # 新規: パイプライン共通型定義
    ab-test/
      manager.ts             # 新規: テスト設計・変数選択・勝ち判定
      reporter.ts            # 新規: 週次レポート+ボトルネック判定
    worker/
      index.ts               # 改修: エントリポイント（Cron+HTTP）
      cron-poster.ts         # 新規: キューからの日次投稿
      approval-api.ts        # 新規: LINE承認受付（既存line-preview.tsから分離）
    batch/
      weekly-run.ts          # 新規: GH Actionsエントリポイント
    instagram.ts             # 既存: そのまま利用
    insights.ts              # 改修: プロフ訪問率等の追加指標
    notion-client.ts         # 既存: そのまま利用
    knowledge.ts             # 既存: そのまま利用
    groq.ts                  # 新規: Groq APIクライアント
  migrations/
    0008_v4_schedule_abtest.sql  # 新規: スケジュールキュー+A/Bテストテーブル
  batch/
    weekly.ts                # 新規: GH Actions用Node.jsスクリプト
    package.json             # 新規: バッチ用依存（sharp, node-fetch等）
  .github/
    workflows/
      ig-weekly-batch.yml    # 新規: 週次バッチワークフロー
  vitest.config.ts           # 新規: テスト設定
  tests/
    pipeline/
      content-planner.test.ts
      caption-writer.test.ts
      scheduler.test.ts
    ab-test/
      manager.test.ts
      reporter.test.ts
```

---

## Task 1: D1スキーマ拡張（スケジュールキュー+A/Bテスト）

**Files:**
- Create: `ig-auto-poster/migrations/0008_v4_schedule_abtest.sql`

- [ ] **Step 1: マイグレーションSQL作成**

```sql
-- スケジュールキュー
CREATE TABLE IF NOT EXISTS schedule_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL DEFAULT 'carousel',
  content_json TEXT NOT NULL,
  caption TEXT NOT NULL,
  media_urls TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL DEFAULT '18:00',
  status TEXT NOT NULL DEFAULT 'pending',
  ab_test_meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  ig_media_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_schedule_queue_status_date
  ON schedule_queue(status, scheduled_date);

-- A/Bテスト定義
CREATE TABLE IF NOT EXISTS ab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_week TEXT NOT NULL,
  test_axis TEXT NOT NULL,
  test_variant TEXT NOT NULL,
  control_variant TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  winner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- A/Bテスト結果（投稿ごと）
CREATE TABLE IF NOT EXISTS ab_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES ab_tests(id),
  queue_id INTEGER NOT NULL REFERENCES schedule_queue(id),
  is_control INTEGER NOT NULL DEFAULT 0,
  variant_value TEXT NOT NULL,
  reach INTEGER,
  saves INTEGER,
  shares INTEGER,
  profile_visits INTEGER,
  save_rate REAL,
  collected_at TEXT
);

-- 勝ちパターン履歴
CREATE TABLE IF NOT EXISTS winning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  axis TEXT NOT NULL,
  variant_value TEXT NOT NULL,
  save_rate REAL NOT NULL,
  test_week TEXT NOT NULL,
  promoted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ファネルKPI週次スナップショット
CREATE TABLE IF NOT EXISTS weekly_kpi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL UNIQUE,
  total_reach INTEGER NOT NULL DEFAULT 0,
  avg_save_rate REAL NOT NULL DEFAULT 0,
  avg_share_rate REAL NOT NULL DEFAULT 0,
  profile_visits INTEGER NOT NULL DEFAULT 0,
  line_registrations INTEGER NOT NULL DEFAULT 0,
  bottleneck TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: ローカルでマイグレーション適用テスト**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --local --file=migrations/0008_v4_schedule_abtest.sql`
Expected: 全テーブル作成成功

- [ ] **Step 3: リモートD1にマイグレーション適用**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --remote --file=migrations/0008_v4_schedule_abtest.sql`
Expected: 全テーブル作成成功

- [ ] **Step 4: コミット**

```bash
git add ig-auto-poster/migrations/0008_v4_schedule_abtest.sql
git commit -m "feat: v4 D1スキーマ追加（スケジュールキュー+A/Bテスト+KPI）"
```

---

## Task 2: 共通型定義 + Groqクライアント

**Files:**
- Create: `ig-auto-poster/src/pipeline/types.ts`
- Create: `ig-auto-poster/src/groq.ts`

- [ ] **Step 1: パイプライン共通型を定義**

```typescript
// ig-auto-poster/src/pipeline/types.ts

export type ContentType = "carousel" | "reel";

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
```

- [ ] **Step 2: Groqクライアント作成**

```typescript
// ig-auto-poster/src/groq.ts

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqResponse {
  choices: { message: { content: string } }[];
}

export async function groqChat(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as GroqResponse;
  return data.choices[0]?.message?.content ?? "";
}

export async function groqJson<T>(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<T> {
  const messagesWithFormat = [
    ...messages,
    { role: "user" as const, content: "JSONのみを返してください。マークダウンのコードブロックは不要です。" },
  ];
  const raw = await groqChat(apiKey, messagesWithFormat, options);
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}
```

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/pipeline/types.ts ig-auto-poster/src/groq.ts
git commit -m "feat: v4共通型定義+Groqクライアント"
```

---

## Task 3: コンテンツプランナー（Groq構成生成）

**Files:**
- Create: `ig-auto-poster/src/pipeline/content-planner.ts`
- Create: `ig-auto-poster/tests/pipeline/content-planner.test.ts`

- [ ] **Step 1: vitest設定（未作成の場合）**

```typescript
// ig-auto-poster/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

Run: `cd ig-auto-poster && npm install -D vitest`

- [ ] **Step 2: テスト作成**

```typescript
// ig-auto-poster/tests/pipeline/content-planner.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildPromptForPlan, parseContentPlan, selectBuzzFormat } from "../../src/pipeline/content-planner";
import type { NetaEntry } from "../../src/pipeline/types";

describe("selectBuzzFormat", () => {
  it("重み付きランダムでフォーマットを選択する", () => {
    const formats = [
      { name: "知ってた系", weight: 10 },
      { name: "ランキング系", weight: 5 },
    ];
    const result = selectBuzzFormat(formats);
    expect(formats.map((f) => f.name)).toContain(result);
  });
});

describe("buildPromptForPlan", () => {
  it("ネタとフォーマットからプロンプトを組み立てる", () => {
    const neta: NetaEntry[] = [
      { id: "1", title: "チャングーのカフェ", content: "地元民に人気のカフェ3選", category: "cafe", tags: ["bali_cafe"], reliability: "firsthand", source: "firsthand" },
    ];
    const prompt = buildPromptForPlan("知ってた系", "cafe", neta);
    expect(prompt).toContain("知ってた系");
    expect(prompt).toContain("チャングーのカフェ");
    expect(prompt).toContain("8-10枚");
  });
});

describe("parseContentPlan", () => {
  it("Groqレスポンスをパースする", () => {
    const json = JSON.stringify({
      hook: "バリのカフェ、150円って知ってた？",
      slides: [
        { heading: "表紙", body: "", slideType: "cover" },
        { heading: "ポイント1", body: "説明文", icon: "☕", slideType: "point" },
        { heading: "まとめ", body: "一覧", slideType: "summary" },
        { heading: "CTA", body: "保存してね", slideType: "cta" },
      ],
      ctaText: "プロフのLINEから無料相談",
    });
    const plan = parseContentPlan(json, "carousel", "知ってた系", "cafe", []);
    expect(plan.hook).toBe("バリのカフェ、150円って知ってた？");
    expect(plan.slides.length).toBe(4);
    expect(plan.slides[0].slideType).toBe("cover");
  });
});
```

- [ ] **Step 3: テスト実行（失敗確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/content-planner.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 4: コンテンツプランナー実装**

```typescript
// ig-auto-poster/src/pipeline/content-planner.ts
import { groqJson } from "../groq";
import type { ContentPlan, ContentType, NetaEntry, SlideContent } from "./types";

interface BuzzFormat {
  name: string;
  weight: number;
}

export function selectBuzzFormat(formats: BuzzFormat[]): string {
  const total = formats.reduce((s, f) => s + f.weight, 0);
  if (total <= 0 || formats.length === 0) return "知ってた系";
  let rand = Math.random() * total;
  for (const f of formats) {
    rand -= f.weight;
    if (rand <= 0) return f.name;
  }
  return formats[0]!.name;
}

export function buildPromptForPlan(
  formatName: string,
  category: string,
  neta: NetaEntry[],
): string {
  const netaList = neta
    .map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`)
    .join("\n");

  return `あなたはInstagramカルーセル投稿の構成作家です。

フォーマット: 「${formatName}」
カテゴリ: ${category}
使えるネタ:
${netaList}

以下の条件でカルーセル投稿の構成をJSON形式で作成してください:
- 8-10枚のスライド構成
- 1枚目: 表紙（hookとなるキャッチコピー、8-10語、情報ギャップを作る）
- 2-8枚目: 1スライド1ポイント（見出し+2-3行の説明）
- 9枚目: まとめ（全ポイントをリスト形式で総括）
- 10枚目: CTA（「保存して」「友達に送って」「プロフのLINEから」のいずれか）
- フォーマット「${formatName}」のトーンに合わせる
- バリリンガルの直接宣伝はしない。Tips型で価値提供

JSON形式:
{
  "hook": "表紙のキャッチコピー",
  "slides": [
    {"heading": "見出し", "body": "本文", "icon": "絵文字1つ", "slideType": "cover|point|summary|cta"}
  ],
  "ctaText": "CTA文言"
}`;
}

interface GroqPlanResponse {
  hook: string;
  slides: { heading: string; body: string; icon?: string; slideType: string }[];
  ctaText: string;
}

export function parseContentPlan(
  json: string,
  contentType: ContentType,
  formatName: string,
  category: string,
  neta: NetaEntry[],
): ContentPlan {
  const parsed = JSON.parse(json) as GroqPlanResponse;
  const slides: SlideContent[] = parsed.slides.map((s) => ({
    heading: s.heading,
    body: s.body,
    icon: s.icon,
    slideType: (s.slideType as SlideContent["slideType"]) || "point",
  }));

  return {
    contentType,
    formatName,
    category,
    hook: parsed.hook,
    slides,
    ctaText: parsed.ctaText,
    neta,
  };
}

export async function generateContentPlan(
  groqApiKey: string,
  formatName: string,
  category: string,
  neta: NetaEntry[],
  contentType: ContentType = "carousel",
): Promise<ContentPlan> {
  const prompt = buildPromptForPlan(formatName, category, neta);
  const result = await groqJson<GroqPlanResponse>(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.8, maxTokens: 2048 });

  return parseContentPlan(JSON.stringify(result), contentType, formatName, category, neta);
}
```

- [ ] **Step 5: テスト実行（成功確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/content-planner.test.ts`
Expected: 3 tests passed

- [ ] **Step 6: コミット**

```bash
git add ig-auto-poster/vitest.config.ts ig-auto-poster/src/pipeline/content-planner.ts ig-auto-poster/tests/pipeline/content-planner.test.ts
git commit -m "feat: v4コンテンツプランナー（Groq構成生成）"
```

---

## Task 4: メディアジェネレーター（sharpテキスト画像生成）

**Files:**
- Create: `ig-auto-poster/src/pipeline/media-generator.ts`

- [ ] **Step 1: sharp依存追加（既にpackage.jsonにあるが確認）**

Run: `cd ig-auto-poster && npm ls sharp`
Expected: sharp@x.x.x が表示される

- [ ] **Step 2: メディアジェネレーター実装**

```typescript
// ig-auto-poster/src/pipeline/media-generator.ts
import sharp from "sharp";
import type { ContentPlan, SlideContent } from "./types";

const WIDTH = 1080;
const HEIGHT = 1350;

export interface DesignVariant {
  name: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

export const DEFAULT_DESIGNS: DesignVariant[] = [
  { name: "white_clean", bgColor: "#FFFFFF", textColor: "#1A1A2E", accentColor: "#E94560", fontFamily: "Noto Sans JP" },
  { name: "dark_modern", bgColor: "#1A1A2E", textColor: "#FFFFFF", accentColor: "#E94560", fontFamily: "Noto Sans JP" },
  { name: "cream_warm", bgColor: "#FFF8F0", textColor: "#2D2D2D", accentColor: "#FF6B35", fontFamily: "Noto Sans JP" },
  { name: "mint_fresh", bgColor: "#F0FFF4", textColor: "#1A1A2E", accentColor: "#38B2AC", fontFamily: "Noto Sans JP" },
];

function createSvgSlide(slide: SlideContent, design: DesignVariant, index: number, total: number): string {
  const iscover = slide.slideType === "cover";
  const isCta = slide.slideType === "cta";
  const isSummary = slide.slideType === "summary";

  const icon = slide.icon ?? "";
  const headingSize = iscover ? 64 : 48;
  const bodySize = iscover ? 36 : 32;
  const headingY = iscover ? 500 : 200;
  const bodyY = iscover ? 620 : 350;

  const bodyLines = slide.body.split("\n").filter(Boolean);
  const bodyText = bodyLines
    .map((line, i) => `<tspan x="540" dy="${i === 0 ? 0 : bodySize * 1.6}">${escapeXml(line)}</tspan>`)
    .join("");

  const pageIndicator = !iscover && !isCta
    ? `<circle cx="${540 - (total - 2) * 10 + index * 20}" cy="1280" r="6" fill="${design.accentColor}"/>
       ${Array.from({ length: total }, (_, i) =>
         i === index ? "" : `<circle cx="${540 - (total - 2) * 10 + i * 20}" cy="1280" r="4" fill="${design.textColor}" opacity="0.3"/>`
       ).join("")}`
    : "";

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${design.bgColor}"/>
    ${iscover ? `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${design.accentColor}" opacity="0.08"/>` : ""}
    ${icon ? `<text x="540" y="${headingY - 80}" text-anchor="middle" font-size="72">${icon}</text>` : ""}
    <text x="540" y="${headingY}" text-anchor="middle" font-size="${headingSize}" font-weight="bold" fill="${iscover ? design.accentColor : design.textColor}" font-family="${design.fontFamily}">
      ${escapeXml(slide.heading)}
    </text>
    <text x="540" y="${bodyY}" text-anchor="middle" font-size="${bodySize}" fill="${design.textColor}" font-family="${design.fontFamily}" opacity="0.85">
      ${bodyText}
    </text>
    ${isCta ? `<rect x="240" y="900" width="600" height="80" rx="40" fill="${design.accentColor}"/>
      <text x="540" y="950" text-anchor="middle" font-size="28" fill="#FFFFFF" font-weight="bold" font-family="${design.fontFamily}">プロフィールのLINEから無料相談</text>` : ""}
    ${isSummary ? `<line x1="340" y1="${headingY + 30}" x2="740" y2="${headingY + 30}" stroke="${design.accentColor}" stroke-width="3"/>` : ""}
    ${pageIndicator}
  </svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function generateCarouselImages(
  plan: ContentPlan,
  design: DesignVariant,
): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (let i = 0; i < plan.slides.length; i++) {
    const svg = createSvgSlide(plan.slides[i]!, design, i, plan.slides.length);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    buffers.push(buf);
  }
  return buffers;
}

export function selectDesign(designName?: string): DesignVariant {
  if (designName) {
    const found = DEFAULT_DESIGNS.find((d) => d.name === designName);
    if (found) return found;
  }
  return DEFAULT_DESIGNS[Math.floor(Math.random() * DEFAULT_DESIGNS.length)]!;
}
```

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/pipeline/media-generator.ts
git commit -m "feat: v4メディアジェネレーター（sharpテキスト画像生成）"
```

---

## Task 5: キャプションライター（Groq生成）

**Files:**
- Create: `ig-auto-poster/src/pipeline/caption-writer.ts`
- Create: `ig-auto-poster/tests/pipeline/caption-writer.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// ig-auto-poster/tests/pipeline/caption-writer.test.ts
import { describe, it, expect } from "vitest";
import { buildCaptionPrompt, formatCaption } from "../../src/pipeline/caption-writer";
import type { ContentPlan } from "../../src/pipeline/types";

describe("buildCaptionPrompt", () => {
  it("プランからキャプション生成プロンプトを組み立てる", () => {
    const plan: ContentPlan = {
      contentType: "carousel",
      formatName: "知ってた系",
      category: "cafe",
      hook: "バリのカフェ150円？",
      slides: [
        { heading: "表紙", body: "", slideType: "cover" },
        { heading: "Point1", body: "説明", icon: "☕", slideType: "point" },
      ],
      ctaText: "保存してね",
      neta: [],
    };
    const prompt = buildCaptionPrompt(plan);
    expect(prompt).toContain("バリのカフェ150円？");
    expect(prompt).toContain("cafe");
  });
});

describe("formatCaption", () => {
  it("フック+本文+CTA+ハッシュタグを結合する", () => {
    const result = formatCaption(
      "フック文",
      "本文ここ",
      "CTA文",
      "cafe",
    );
    expect(result).toContain("フック文");
    expect(result).toContain("本文ここ");
    expect(result).toContain("#バリ島");
    expect(result).toContain("LINE");
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/caption-writer.test.ts`
Expected: FAIL

- [ ] **Step 3: キャプションライター実装**

```typescript
// ig-auto-poster/src/pipeline/caption-writer.ts
import { groqChat } from "../groq";
import type { ContentPlan } from "./types";

const COMMON_HASHTAGS = "#バリ島 #バリ旅行 #バリ島留学 #バリリンガル #海外旅行 #インドネシア #バリ島情報 #バリ島おすすめ";

const CATEGORY_HASHTAGS: Record<string, string> = {
  cafe: "#バリ島カフェ",
  spot: "#バリ島観光",
  food: "#バリ島グルメ",
  beach: "#バリ島ビーチ",
  lifestyle: "#バリ島移住",
  cost: "#バリ島物価",
  visa: "#バリ島ビザ",
  culture: "#バリ島文化",
};

const LINE_CTA = `---
留学の費用が気になったら
プロフィールのLINEから無料で費用表を受け取れます`;

export function buildCaptionPrompt(plan: ContentPlan): string {
  const slidesSummary = plan.slides
    .filter((s) => s.slideType === "point")
    .map((s) => `- ${s.heading}: ${s.body.slice(0, 80)}`)
    .join("\n");

  return `Instagramカルーセル投稿のキャプションを書いてください。

フォーマット: ${plan.formatName}
カテゴリ: ${plan.category}
フック（表紙）: ${plan.hook}
スライド内容:
${slidesSummary}

条件:
- 1行目: フック文（表紙と同じか、少し変えたもの）
- 2-5行: 投稿内容の要約（読みたくなる書き方）
- バリリンガルの直接宣伝なし
- 自然体で、テンプレ感のない文体
- 200文字以内

キャプション本文のみを返してください（ハッシュタグ不要）。`;
}

export function formatCaption(
  hook: string,
  body: string,
  ctaText: string,
  category: string,
): string {
  const catTag = CATEGORY_HASHTAGS[category] ?? "#バリ島";
  const hashtags = `${COMMON_HASHTAGS} ${catTag}`;
  return [hook, "", body, "", LINE_CTA, "", hashtags].join("\n");
}

export async function generateCaption(
  groqApiKey: string,
  plan: ContentPlan,
): Promise<string> {
  const prompt = buildCaptionPrompt(plan);
  const body = await groqChat(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.8, maxTokens: 512 });

  return formatCaption(plan.hook, body.trim(), plan.ctaText, plan.category);
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/caption-writer.test.ts`
Expected: 2 tests passed

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/pipeline/caption-writer.ts ig-auto-poster/tests/pipeline/caption-writer.test.ts
git commit -m "feat: v4キャプションライター（Groq生成）"
```

---

## Task 6: スケジューラー（投稿キュー管理）

**Files:**
- Create: `ig-auto-poster/src/pipeline/scheduler.ts`
- Create: `ig-auto-poster/tests/pipeline/scheduler.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// ig-auto-poster/tests/pipeline/scheduler.test.ts
import { describe, it, expect } from "vitest";
import { buildScheduleDates, buildInsertParams } from "../../src/pipeline/scheduler";
import type { ABTestMeta } from "../../src/pipeline/types";

describe("buildScheduleDates", () => {
  it("月曜起点で7日分の日付を生成する", () => {
    const dates = buildScheduleDates("2026-04-06", 7);
    expect(dates).toEqual([
      "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09",
      "2026-04-10", "2026-04-11", "2026-04-12",
    ]);
  });
});

describe("buildInsertParams", () => {
  it("投稿データをD1 INSERT用パラメータに変換する", () => {
    const meta: ABTestMeta = {
      contentType: "carousel",
      testWeek: "2026-W15",
      testAxis: "design",
      testVariant: "dark_modern",
      isControl: false,
    };
    const params = buildInsertParams(
      "carousel",
      '{"slides":[]}',
      "caption text",
      '["url1","url2"]',
      "2026-04-06",
      "18:00",
      meta,
    );
    expect(params.length).toBe(7);
    expect(params[4]).toBe("2026-04-06");
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: スケジューラー実装**

```typescript
// ig-auto-poster/src/pipeline/scheduler.ts
import type { ABTestMeta, GeneratedPost } from "./types";

export function buildScheduleDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().split("T")[0]!);
  }
  return dates;
}

export function buildInsertParams(
  contentType: string,
  contentJson: string,
  caption: string,
  mediaUrls: string,
  scheduledDate: string,
  scheduledTime: string,
  abTestMeta: ABTestMeta,
): (string | null)[] {
  return [
    contentType,
    contentJson,
    caption,
    mediaUrls,
    scheduledDate,
    scheduledTime,
    JSON.stringify(abTestMeta),
  ];
}

export async function enqueuePost(
  db: D1Database,
  post: GeneratedPost,
  scheduledDate: string,
  scheduledTime: string = "18:00",
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO schedule_queue
       (content_type, content_json, caption, media_urls, scheduled_date, scheduled_time, status, ab_test_meta)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(
      ...buildInsertParams(
        post.contentType,
        post.contentJson,
        post.caption,
        JSON.stringify(post.mediaUrls),
        scheduledDate,
        scheduledTime,
        post.abTestMeta,
      ),
    )
    .run();

  return result.meta.last_row_id;
}

export async function enqueueWeekly(
  db: D1Database,
  posts: GeneratedPost[],
  startDate: string,
  scheduledTime: string = "18:00",
): Promise<number[]> {
  const dates = buildScheduleDates(startDate, posts.length);
  const ids: number[] = [];
  for (let i = 0; i < posts.length; i++) {
    const id = await enqueuePost(db, posts[i]!, dates[i]!, scheduledTime);
    ids.push(id);
  }
  return ids;
}

export async function getNextScheduledPost(
  db: D1Database,
  today: string,
): Promise<{ id: number; content_type: string; content_json: string; caption: string; media_urls: string } | null> {
  return db
    .prepare(
      `SELECT id, content_type, content_json, caption, media_urls
       FROM schedule_queue
       WHERE status = 'approved' AND scheduled_date <= ?
       ORDER BY scheduled_date ASC, scheduled_time ASC
       LIMIT 1`,
    )
    .bind(today)
    .first();
}

export async function markPosted(
  db: D1Database,
  queueId: number,
  igMediaId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE schedule_queue SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?`,
    )
    .bind(igMediaId, queueId)
    .run();
}

export async function approveAllPending(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`UPDATE schedule_queue SET status = 'approved' WHERE status = 'pending'`)
    .run();
  return result.meta.changes;
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `cd ig-auto-poster && npx vitest run tests/pipeline/scheduler.test.ts`
Expected: 2 tests passed

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/pipeline/scheduler.ts ig-auto-poster/tests/pipeline/scheduler.test.ts
git commit -m "feat: v4スケジューラー（投稿キュー管理）"
```

---

## Task 7: A/Bテストマネージャー

**Files:**
- Create: `ig-auto-poster/src/ab-test/manager.ts`
- Create: `ig-auto-poster/tests/ab-test/manager.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// ig-auto-poster/tests/ab-test/manager.test.ts
import { describe, it, expect } from "vitest";
import {
  detectBottleneck,
  determineTestAxis,
  assignTestGroups,
} from "../../src/ab-test/manager";

describe("detectBottleneck", () => {
  it("保存率が低い場合、evaluation層を返す", () => {
    expect(detectBottleneck(0.02, 0.06, 80)).toBe("evaluation");
  });

  it("保存率OKでプロフ訪問率が低い場合、interest層を返す", () => {
    expect(detectBottleneck(0.04, 0.03, 80)).toBe("interest");
  });

  it("両方OKでLINE登録が目標未満の場合、action層を返す", () => {
    expect(detectBottleneck(0.04, 0.06, 80)).toBe("action");
  });

  it("全層OKの場合、awareness層を返す", () => {
    expect(detectBottleneck(0.04, 0.06, 110)).toBe("awareness");
  });
});

describe("determineTestAxis", () => {
  it("ボトルネックに対応するテスト軸を返す", () => {
    expect(determineTestAxis("evaluation")).toBe("design");
    expect(determineTestAxis("interest")).toBe("hook");
    expect(determineTestAxis("action")).toBe("cta");
    expect(determineTestAxis("awareness")).toBe("post_time");
  });
});

describe("assignTestGroups", () => {
  it("7投稿を5コントロール+2テストに分割する", () => {
    const groups = assignTestGroups(7, "2026-W15", "design", "dark_modern", "white_clean");
    const controls = groups.filter((g) => g.isControl);
    const tests = groups.filter((g) => !g.isControl);
    expect(controls.length).toBe(5);
    expect(tests.length).toBe(2);
    expect(tests[0]!.testVariant).toBe("dark_modern");
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `cd ig-auto-poster && npx vitest run tests/ab-test/manager.test.ts`
Expected: FAIL

- [ ] **Step 3: A/Bテストマネージャー実装**

```typescript
// ig-auto-poster/src/ab-test/manager.ts
import type { ABTestMeta } from "../pipeline/types";
import type { DesignVariant } from "../pipeline/media-generator";
import { DEFAULT_DESIGNS } from "../pipeline/media-generator";

const SAVE_RATE_THRESHOLD = 0.03;
const PROFILE_VISIT_THRESHOLD = 0.05;
const LINE_REG_MONTHLY_TARGET = 100;

type Bottleneck = "awareness" | "evaluation" | "interest" | "action";
type TestAxis = "design" | "format" | "hook" | "cta" | "post_time" | "hashtag";

export function detectBottleneck(
  avgSaveRate: number,
  profileVisitRate: number,
  lineRegistrationsMonth: number,
): Bottleneck {
  if (avgSaveRate < SAVE_RATE_THRESHOLD) return "evaluation";
  if (profileVisitRate < PROFILE_VISIT_THRESHOLD) return "interest";
  if (lineRegistrationsMonth < LINE_REG_MONTHLY_TARGET) return "action";
  return "awareness";
}

const BOTTLENECK_TO_AXIS: Record<Bottleneck, TestAxis> = {
  evaluation: "design",
  interest: "hook",
  action: "cta",
  awareness: "post_time",
};

export function determineTestAxis(bottleneck: Bottleneck): TestAxis {
  return BOTTLENECK_TO_AXIS[bottleneck];
}

export function assignTestGroups(
  totalPosts: number,
  testWeek: string,
  testAxis: string,
  testVariant: string,
  controlVariant: string,
): ABTestMeta[] {
  const metas: ABTestMeta[] = [];
  const testIndices = new Set([2, 5]);

  for (let i = 0; i < totalPosts; i++) {
    const isTest = testIndices.has(i);
    metas.push({
      contentType: "carousel",
      testWeek,
      testAxis,
      testVariant: isTest ? testVariant : controlVariant,
      isControl: !isTest,
    });
  }
  return metas;
}

export async function selectTestVariant(
  db: D1Database,
  axis: TestAxis,
  currentWinner: string,
): Promise<string> {
  if (axis === "design") {
    const alternatives = DEFAULT_DESIGNS.filter((d) => d.name !== currentWinner);
    if (alternatives.length === 0) return DEFAULT_DESIGNS[0]!.name;
    const pastTests = await db
      .prepare("SELECT test_variant FROM ab_tests WHERE test_axis = 'design' AND status = 'completed' AND winner IS NULL")
      .all<{ test_variant: string }>();
    const losers = new Set(pastTests.results.map((r) => r.test_variant));
    const untested = alternatives.filter((d) => !losers.has(d.name));
    if (untested.length > 0) return untested[0]!.name;
    return alternatives[0]!.name;
  }
  return `${axis}_variant_b`;
}

export async function judgeWinner(
  db: D1Database,
  testId: number,
): Promise<string | null> {
  const controlRows = await db
    .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 1 AND save_rate IS NOT NULL")
    .bind(testId)
    .all<{ save_rate: number }>();

  const testRows = await db
    .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 0 AND save_rate IS NOT NULL")
    .bind(testId)
    .all<{ save_rate: number }>();

  if (controlRows.results.length === 0 || testRows.results.length === 0) return null;

  const controlAvg = controlRows.results.reduce((s, r) => s + r.save_rate, 0) / controlRows.results.length;
  const testAvg = testRows.results.reduce((s, r) => s + r.save_rate, 0) / testRows.results.length;

  return testAvg > controlAvg ? "test" : "control";
}

export async function createTest(
  db: D1Database,
  testWeek: string,
  testAxis: string,
  testVariant: string,
  controlVariant: string,
): Promise<number> {
  const result = await db
    .prepare(
      "INSERT INTO ab_tests (test_week, test_axis, test_variant, control_variant) VALUES (?, ?, ?, ?)",
    )
    .bind(testWeek, testAxis, testVariant, controlVariant)
    .run();
  return result.meta.last_row_id;
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `cd ig-auto-poster && npx vitest run tests/ab-test/manager.test.ts`
Expected: 5 tests passed

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/ab-test/manager.ts ig-auto-poster/tests/ab-test/manager.test.ts
git commit -m "feat: v4 A/Bテストマネージャー（ボトルネック判定+テスト設計）"
```

---

## Task 8: 週次レポーター

**Files:**
- Create: `ig-auto-poster/src/ab-test/reporter.ts`
- Create: `ig-auto-poster/tests/ab-test/reporter.test.ts`

- [ ] **Step 1: テスト作成**

```typescript
// ig-auto-poster/tests/ab-test/reporter.test.ts
import { describe, it, expect } from "vitest";
import { formatWeeklyReport } from "../../src/ab-test/reporter";
import type { WeeklyReport } from "../../src/pipeline/types";

describe("formatWeeklyReport", () => {
  it("レポートをLINE通知用テキストにフォーマットする", () => {
    const report: WeeklyReport = {
      week: "2026-W15",
      lineRegistrations: 8,
      totalReach: 12400,
      avgSaveRate: 0.042,
      avgShareRate: 0.012,
      profileVisits: 480,
      bottleneck: "interest",
      abTestResult: {
        axis: "design",
        winner: "test",
        controlRate: 0.038,
        testRate: 0.051,
      },
      nextTestAxis: "hook",
      nextTestVariant: "question_hook",
    };
    const text = formatWeeklyReport(report);
    expect(text).toContain("2026-W15");
    expect(text).toContain("LINE登録: 8件");
    expect(text).toContain("12,400");
    expect(text).toContain("4.2%");
    expect(text).toContain("ボトルネック");
    expect(text).toContain("hook");
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `cd ig-auto-poster && npx vitest run tests/ab-test/reporter.test.ts`
Expected: FAIL

- [ ] **Step 3: レポーター実装**

```typescript
// ig-auto-poster/src/ab-test/reporter.ts
import type { WeeklyReport, PostInsights } from "../pipeline/types";
import { detectBottleneck, determineTestAxis, judgeWinner } from "./manager";

export function formatWeeklyReport(report: WeeklyReport): string {
  const saveRatePct = (report.avgSaveRate * 100).toFixed(1);
  const shareRatePct = (report.avgShareRate * 100).toFixed(1);

  const bottleneckLabels: Record<string, string> = {
    awareness: "認知層（リーチ）",
    evaluation: "評価層（保存率）",
    interest: "興味層（プロフ訪問率）",
    action: "行動層（LINE登録）",
  };

  let abSection = "A/Bテスト: 結果なし";
  if (report.abTestResult) {
    const r = report.abTestResult;
    const controlPct = (r.controlRate * 100).toFixed(1);
    const testPct = (r.testRate * 100).toFixed(1);
    const winnerLabel = r.winner === "test" ? "テスト群 勝利" : r.winner === "control" ? "コントロール群 勝利" : "判定不能";
    abSection = `A/Bテスト結果:\n  軸: ${r.axis}\n  ${winnerLabel}（テスト${testPct}% vs コントロール${controlPct}%）`;
  }

  return `週次レポート ${report.week}

LINE登録: ${report.lineRegistrations}件（目標${Math.ceil(LINE_REG_WEEKLY_TARGET)}件/週）
リーチ: ${report.totalReach.toLocaleString()}
保存率: ${saveRatePct}%
シェア率: ${shareRatePct}%
プロフ訪問: ${report.profileVisits}

${abSection}

ボトルネック: ${bottleneckLabels[report.bottleneck] ?? report.bottleneck}
次週テスト軸: ${report.nextTestAxis}
テスト内容: ${report.nextTestVariant}`;
}

const LINE_REG_WEEKLY_TARGET = 100 / 4.33;

export async function buildWeeklyReport(
  db: D1Database,
  week: string,
  lineRegistrations: number,
): Promise<WeeklyReport> {
  const rows = await db
    .prepare(
      `SELECT sq.id, atr.reach, atr.saves, atr.shares, atr.profile_visits, atr.save_rate
       FROM schedule_queue sq
       LEFT JOIN ab_test_results atr ON atr.queue_id = sq.id
       WHERE sq.status = 'posted'
         AND sq.ab_test_meta LIKE ?`,
    )
    .bind(`%"testWeek":"${week}"%`)
    .all<{ id: number; reach: number | null; saves: number | null; shares: number | null; profile_visits: number | null; save_rate: number | null }>();

  const posted = rows.results.filter((r) => r.reach != null);
  const totalReach = posted.reduce((s, r) => s + (r.reach ?? 0), 0);
  const avgSaveRate = posted.length > 0
    ? posted.reduce((s, r) => s + (r.save_rate ?? 0), 0) / posted.length
    : 0;
  const avgShareRate = posted.length > 0
    ? posted.reduce((s, r) => s + ((r.shares ?? 0) / Math.max(r.reach ?? 1, 1)), 0) / posted.length
    : 0;
  const profileVisits = posted.reduce((s, r) => s + (r.profile_visits ?? 0), 0);
  const profileVisitRate = totalReach > 0 ? profileVisits / totalReach : 0;

  const bottleneck = detectBottleneck(avgSaveRate, profileVisitRate, lineRegistrations);
  const nextTestAxis = determineTestAxis(bottleneck);

  const activeTest = await db
    .prepare("SELECT id, test_axis, test_variant FROM ab_tests WHERE test_week = ? LIMIT 1")
    .bind(week)
    .first<{ id: number; test_axis: string; test_variant: string }>();

  let abTestResult: WeeklyReport["abTestResult"] = null;
  if (activeTest) {
    const winner = await judgeWinner(db, activeTest.id);
    const controlRows = await db
      .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 1 AND save_rate IS NOT NULL")
      .bind(activeTest.id)
      .all<{ save_rate: number }>();
    const testRows = await db
      .prepare("SELECT save_rate FROM ab_test_results WHERE test_id = ? AND is_control = 0 AND save_rate IS NOT NULL")
      .bind(activeTest.id)
      .all<{ save_rate: number }>();

    const controlAvg = controlRows.results.length > 0
      ? controlRows.results.reduce((s, r) => s + r.save_rate, 0) / controlRows.results.length
      : 0;
    const testAvg = testRows.results.length > 0
      ? testRows.results.reduce((s, r) => s + r.save_rate, 0) / testRows.results.length
      : 0;

    abTestResult = {
      axis: activeTest.test_axis,
      winner,
      controlRate: controlAvg,
      testRate: testAvg,
    };

    if (winner === "test") {
      await db
        .prepare("INSERT INTO winning_patterns (axis, variant_value, save_rate, test_week) VALUES (?, ?, ?, ?)")
        .bind(activeTest.test_axis, activeTest.test_variant, testAvg, week)
        .run();
    }
    await db
      .prepare("UPDATE ab_tests SET status = 'completed', winner = ?, completed_at = datetime('now') WHERE id = ?")
      .bind(winner, activeTest.id)
      .run();
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO weekly_kpi (week, total_reach, avg_save_rate, avg_share_rate, profile_visits, line_registrations, bottleneck)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(week, totalReach, avgSaveRate, avgShareRate, profileVisits, lineRegistrations, bottleneck)
    .run();

  return {
    week,
    lineRegistrations,
    totalReach,
    avgSaveRate,
    avgShareRate,
    profileVisits,
    bottleneck,
    abTestResult,
    nextTestAxis,
    nextTestVariant: `${nextTestAxis}_variant_auto`,
  };
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `cd ig-auto-poster && npx vitest run tests/ab-test/reporter.test.ts`
Expected: 1 test passed

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/ab-test/reporter.ts ig-auto-poster/tests/ab-test/reporter.test.ts
git commit -m "feat: v4週次レポーター（ファネルKPI+ボトルネック分析）"
```

---

## Task 9: ネタ収集パイプライン

**Files:**
- Create: `ig-auto-poster/src/pipeline/neta-collector.ts`

- [ ] **Step 1: ネタ収集実装**

```typescript
// ig-auto-poster/src/pipeline/neta-collector.ts
import { groqJson } from "../groq";
import type { NetaEntry } from "./types";

interface RSSItem {
  title: string;
  link: string;
  description: string;
}

export async function fetchRSS(feedUrl: string): Promise<RSSItem[]> {
  const res = await fetch(feedUrl);
  if (!res.ok) return [];
  const text = await res.text();

  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1] ?? "";
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] ?? block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] ?? "";
    if (title) items.push({ title, link, description: description.slice(0, 300) });
  }
  return items.slice(0, 10);
}

interface AbstractedTheme {
  abstract: string;
  concrete: string;
  category: string;
  tags: string[];
}

export async function abstractAndConcretize(
  groqApiKey: string,
  items: { title: string; description: string }[],
  existingKnowledge: string[],
): Promise<AbstractedTheme[]> {
  const itemList = items
    .slice(0, 5)
    .map((i) => `- ${i.title}: ${i.description.slice(0, 100)}`)
    .join("\n");

  const existing = existingKnowledge.slice(0, 10).join(", ");

  const prompt = `以下の記事/投稿から、バリ島留学・英語学習に関連するコンテンツのネタを抽出してください。

記事:
${itemList}

既存ネタ（重複を避ける）: ${existing}

各記事について:
1. 核心テーマを1つ抽出（抽象化）
2. バリリンガル（バリ島の語学学校）の視点で独自ネタに変換（具体化）
3. カテゴリとタグを付与

JSON配列で返してください:
[{"abstract": "抽象テーマ", "concrete": "具体化したネタタイトル", "category": "cafe|spot|food|beach|lifestyle|cost|visa|culture", "tags": ["tag1"]}]

関連性が低い記事はスキップしてください。`;

  return groqJson<AbstractedTheme[]>(groqApiKey, [
    { role: "user", content: prompt },
  ], { temperature: 0.6, maxTokens: 1024 });
}

export async function collectAndStoreNeta(
  groqApiKey: string,
  notionApiKey: string,
  notionDbId: string,
  rssFeeds: string[],
): Promise<NetaEntry[]> {
  const allItems: { title: string; description: string }[] = [];
  for (const feed of rssFeeds) {
    const items = await fetchRSS(feed);
    allItems.push(...items.map((i) => ({ title: i.title, description: i.description })));
  }

  if (allItems.length === 0) return [];

  const themes = await abstractAndConcretize(groqApiKey, allItems, []);

  const entries: NetaEntry[] = themes.map((t, i) => ({
    id: `auto_${Date.now()}_${i}`,
    title: t.concrete,
    content: `${t.abstract} → ${t.concrete}`,
    category: t.category,
    tags: t.tags,
    reliability: "unverified" as const,
    source: "auto_research",
  }));

  // Notion投入（knowledge-save.mjsと同等のロジック）
  for (const entry of entries) {
    try {
      await fetch(`https://api.notion.com/v1/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties: {
            Title: { title: [{ text: { content: entry.title } }] },
            Category: { select: { name: entry.category } },
            Tags: { multi_select: entry.tags.map((t) => ({ name: t })) },
            Source: { select: { name: "auto_research" } },
            Reliability: { select: { name: "unverified" } },
          },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ text: { content: entry.content } }] },
            },
          ],
        }),
      });
    } catch {
      // Notion投入失敗は無視して続行
    }
  }

  return entries;
}
```

- [ ] **Step 2: コミット**

```bash
git add ig-auto-poster/src/pipeline/neta-collector.ts
git commit -m "feat: v4ネタ収集パイプライン（RSS+Groq抽象化/具体化+Notion投入）"
```

---

## Task 10: Workerリファクタ（Cron投稿+承認API）

**Files:**
- Create: `ig-auto-poster/src/worker/cron-poster.ts`
- Create: `ig-auto-poster/src/worker/approval-api.ts`
- Modify: `ig-auto-poster/src/index.ts`

- [ ] **Step 1: Cron投稿ハンドラー作成**

```typescript
// ig-auto-poster/src/worker/cron-poster.ts
import { publishCarousel } from "../instagram";
import { getNextScheduledPost, markPosted } from "../pipeline/scheduler";

export async function handleDailyPostCron(
  db: D1Database,
  igAccessToken: string,
  igAccountId: string,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;
  const post = await getNextScheduledPost(db, today);

  if (!post) {
    console.log("No approved post scheduled for today.");
    return;
  }

  const mediaUrls = JSON.parse(post.media_urls) as string[];

  if (post.content_type === "carousel") {
    const igMediaId = await publishCarousel(mediaUrls, post.caption, igAccessToken, igAccountId);
    await markPosted(db, post.id, igMediaId);
    console.log(`Posted carousel ${post.id}, IG media: ${igMediaId}`);
  }
  // reel対応は将来追加
}
```

- [ ] **Step 2: 承認APIハンドラー作成**

```typescript
// ig-auto-poster/src/worker/approval-api.ts
import { approveAllPending } from "../pipeline/scheduler";

export async function handleApproval(
  db: D1Database,
  action: string,
): Promise<{ ok: boolean; message: string }> {
  if (action === "approve_all") {
    const count = await approveAllPending(db);
    return { ok: true, message: `${count}件の投稿を承認しました` };
  }

  if (action.startsWith("approve_")) {
    const id = parseInt(action.replace("approve_", ""), 10);
    if (isNaN(id)) return { ok: false, message: "無効なID" };
    await db
      .prepare("UPDATE schedule_queue SET status = 'approved' WHERE id = ?")
      .bind(id)
      .run();
    return { ok: true, message: `投稿 #${id} を承認しました` };
  }

  if (action.startsWith("reject_")) {
    const id = parseInt(action.replace("reject_", ""), 10);
    if (isNaN(id)) return { ok: false, message: "無効なID" };
    await db
      .prepare("UPDATE schedule_queue SET status = 'rejected' WHERE id = ?")
      .bind(id)
      .run();
    return { ok: true, message: `投稿 #${id} を却下しました` };
  }

  return { ok: false, message: "不明なアクション" };
}
```

- [ ] **Step 3: index.tsにv4 Cronハンドラーを追加**

既存の `index.ts` のscheduledイベントハンドラーに `handleDailyPostCron` を追加。
既存のHTTPハンドラーに `/api/v4/approve` エンドポイントを追加。

具体的には `index.ts` の `scheduled` イベント内で:
```typescript
// 既存のCronの後に追加
if (event.cron === "0 10 * * *") {
  // 毎日18:00 JST (UTC+8 = 10:00 UTC) に投稿
  await handleDailyPostCron(env.DB, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
}
```

`wrangler.toml` の `[triggers]` に `"0 10 * * *"` を追加。

HTTPハンドラーに:
```typescript
// LINE Webhook postback処理内に追加
if (postbackData.startsWith("v4_")) {
  const action = postbackData.replace("v4_", "");
  const result = await handleApproval(env.DB, action);
  // LINE返信
}
```

- [ ] **Step 4: wrangler.tomlにCron追加**

`[triggers]` セクションに `"0 10 * * *"` を追加（既存のCronは維持）。

- [ ] **Step 5: tsc --noEmit で型チェック**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add ig-auto-poster/src/worker/ ig-auto-poster/src/index.ts ig-auto-poster/wrangler.toml
git commit -m "feat: v4 Worker（日次Cron投稿+承認API）"
```

---

## Task 11: インサイト収集の拡張（プロフ訪問率追加）

**Files:**
- Modify: `ig-auto-poster/src/insights.ts`

- [ ] **Step 1: 既存のcollectInsightsを拡張**

`collectInsights` 関数に以下を追加:
- `profile_visits` の取得（IG Graph API `/me/insights` の `profile_views` メトリック）
- 取得結果を `ab_test_results` テーブルにも書き込む（`schedule_queue.ig_media_id` と突合）

```typescript
// insights.ts に追加する関数
export async function collectInsightsV4(
  db: D1Database,
  accessToken: string,
  accountId: string,
): Promise<void> {
  // 投稿ごとのインサイト（既存ロジック拡張）
  const posts = await db
    .prepare(
      `SELECT sq.id AS queue_id, sq.ig_media_id, sq.ab_test_meta
       FROM schedule_queue sq
       WHERE sq.status = 'posted'
         AND sq.ig_media_id IS NOT NULL
         AND sq.id NOT IN (SELECT queue_id FROM ab_test_results)
         AND sq.posted_at <= datetime('now', '-2 days')
       LIMIT 20`,
    )
    .all<{ queue_id: number; ig_media_id: string; ab_test_meta: string }>();

  for (const post of posts.results) {
    const url = `https://graph.facebook.com/v21.0/${post.ig_media_id}/insights?metric=saved,reach,shares&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) continue;

    const data = (await res.json()) as { data: { name: string; values: { value: number }[] }[] };
    const metrics: Record<string, number> = {};
    for (const m of data.data) {
      metrics[m.name] = m.values[0]?.value ?? 0;
    }

    const reach = metrics.reach ?? 0;
    const saves = metrics.saved ?? 0;
    const shares = metrics.shares ?? 0;
    const saveRate = reach > 0 ? saves / reach : 0;

    const meta = JSON.parse(post.ab_test_meta || "{}") as { testWeek?: string; isControl?: boolean; testVariant?: string };
    const testRow = meta.testWeek
      ? await db.prepare("SELECT id FROM ab_tests WHERE test_week = ? LIMIT 1").bind(meta.testWeek).first<{ id: number }>()
      : null;

    if (testRow) {
      await db
        .prepare(
          `INSERT INTO ab_test_results (test_id, queue_id, is_control, variant_value, reach, saves, shares, save_rate, collected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(testRow.id, post.queue_id, meta.isControl ? 1 : 0, meta.testVariant ?? "", reach, saves, shares, saveRate)
        .run();
    }
  }

  // アカウントレベルのプロフ訪問数（過去7日）
  const profileUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?metric=profile_views&period=day&since=${getUnixDaysAgo(7)}&until=${getUnixDaysAgo(0)}&access_token=${accessToken}`;
  const profileRes = await fetch(profileUrl);
  if (profileRes.ok) {
    const profileData = (await profileRes.json()) as { data: { values: { value: number }[] }[] };
    const totalViews = profileData.data[0]?.values?.reduce((s, v) => s + v.value, 0) ?? 0;
    console.log(`Profile views (7d): ${totalViews}`);
  }
}

function getUnixDaysAgo(daysAgo: number): number {
  return Math.floor((Date.now() - daysAgo * 86400000) / 1000);
}
```

- [ ] **Step 2: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/insights.ts
git commit -m "feat: v4インサイト収集拡張（A/Bテスト結果+プロフ訪問率）"
```

---

## Task 12: GH Actionsバッチスクリプト

**Files:**
- Create: `ig-auto-poster/batch/weekly.ts`
- Create: `ig-auto-poster/batch/package.json`
- Create: `ig-auto-poster/batch/tsconfig.json`

- [ ] **Step 1: バッチ用package.json作成**

```json
{
  "name": "ig-auto-poster-batch",
  "private": true,
  "type": "module",
  "scripts": {
    "weekly": "npx tsx weekly.ts"
  },
  "dependencies": {
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: バッチ用tsconfig.json作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["*.ts", "../src/**/*.ts"]
}
```

- [ ] **Step 3: 週次バッチスクリプト実装**

```typescript
// ig-auto-poster/batch/weekly.ts
//
// GH Actionsから実行される週次バッチ。
// 1. ネタ収集 → 2. 週次レポート → 3. 7投稿生成 → 4. LINE通知
//
// 環境変数: GROQ_API_KEY, NOTION_API_KEY, NOTION_KNOWLEDGE_DB_ID,
//           NOTION_BUZZ_FORMATS_DB_ID, CF_API_TOKEN, CF_ACCOUNT_ID,
//           D1_DATABASE_ID, R2_BUCKET_NAME, R2_PUBLIC_URL,
//           LINE_CHANNEL_ACCESS_TOKEN, LINE_OWNER_USER_ID,
//           IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID

const env = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
};

async function main() {
  const groqKey = env("GROQ_API_KEY");
  const notionKey = env("NOTION_API_KEY");
  const notionKnowledgeDb = env("NOTION_KNOWLEDGE_DB_ID");
  const lineToken = env("LINE_CHANNEL_ACCESS_TOKEN");
  const lineUserId = env("LINE_OWNER_USER_ID");

  console.log("=== Step 1: ネタ収集 ===");
  // collectAndStoreNeta を呼び出す（RSSフィードURLはD1 settingsから取得）
  // 省略時はスキップ

  console.log("=== Step 2: 週次レポート ===");
  // buildWeeklyReport → formatWeeklyReport → LINE通知

  console.log("=== Step 3: 7投稿バッチ生成 ===");
  // ループ: selectBuzzFormat → fetchKnowledge → generateContentPlan
  //         → generateCarouselImages → generateCaption → R2アップロード

  console.log("=== Step 4: LINE通知（プレビュー一覧） ===");
  // 7投稿のプレビュー画像（表紙のみ）をLINEに送信
  // 「一括承認」ボタン付き

  console.log("=== 完了 ===");
}

main().catch((e) => {
  console.error("Batch failed:", e);
  process.exit(1);
});
```

注: このファイルはTask 10までの全モジュールを統合するオーケストレーター。
各import先は前タスクで作成済み。D1アクセスはCloudflare REST API経由で行う
（GH Actions上ではWorkerランタイム外のため）。

D1 REST APIヘルパーの追加が必要:

```typescript
// ig-auto-poster/batch/d1-rest.ts
const CF_API_URL = "https://api.cloudflare.com/client/v4";

export async function d1Query<T>(
  accountId: string,
  databaseId: string,
  apiToken: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await fetch(
    `${CF_API_URL}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  if (!res.ok) throw new Error(`D1 API error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result: { results: T[] }[] };
  return data.result[0]?.results ?? [];
}
```

- [ ] **Step 4: コミット**

```bash
git add ig-auto-poster/batch/
git commit -m "feat: v4 GH Actionsバッチスクリプト（週次オーケストレーター）"
```

---

## Task 13: GH Actionsワークフロー

**Files:**
- Create: `.github/workflows/ig-weekly-batch.yml`

- [ ] **Step 1: ワークフロー作成**

```yaml
# .github/workflows/ig-weekly-batch.yml
name: IG Weekly Batch

on:
  schedule:
    - cron: "0 22 * * 0"  # 毎週月曜 06:00 JST (UTC+8 = 日曜 22:00 UTC)
  workflow_dispatch:       # 手動実行も可能

jobs:
  weekly-batch:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install batch dependencies
        working-directory: ig-auto-poster/batch
        run: npm install

      - name: Run weekly batch
        working-directory: ig-auto-poster/batch
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_KNOWLEDGE_DB_ID: ${{ secrets.NOTION_KNOWLEDGE_DB_ID }}
          NOTION_BUZZ_FORMATS_DB_ID: ${{ secrets.NOTION_BUZZ_FORMATS_DB_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          R2_PUBLIC_URL: ${{ secrets.R2_PUBLIC_URL }}
          LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
          LINE_OWNER_USER_ID: ${{ secrets.LINE_OWNER_USER_ID }}
          IG_ACCESS_TOKEN: ${{ secrets.IG_ACCESS_TOKEN }}
          IG_BUSINESS_ACCOUNT_ID: ${{ secrets.IG_BUSINESS_ACCOUNT_ID }}
        run: npx tsx weekly.ts
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/ig-weekly-batch.yml
git commit -m "feat: v4 GH Actions週次バッチワークフロー"
```

---

## Task 14: 旧モジュール削除 + デプロイ

**Files:**
- Delete: `ig-auto-poster/src/content-generator.ts`
- Delete: `ig-auto-poster/src/content-generator-v2.ts`
- Delete: `ig-auto-poster/src/content-generator-v3.ts`
- Delete: `ig-auto-poster/src/caption-generator.ts`
- Delete: `ig-auto-poster/src/captions.ts`
- Delete: `ig-auto-poster/src/content-data.ts`
- Delete: `ig-auto-poster/src/pdca-engine.ts`
- Delete: `ig-auto-poster/src/photo-search.ts`
- Delete: `ig-auto-poster/src/unsplash.ts`
- Delete: `ig-auto-poster/src/satori-types.ts`
- Modify: `ig-auto-poster/src/index.ts` (旧Cronハンドラー削除)

- [ ] **Step 1: index.tsから旧v3 Cronハンドラーを削除**

`handleV3GenerateCron` と `handleV3PostCron` の呼び出しを削除。
旧import文を削除。v4のimportに置換。

- [ ] **Step 2: 旧ファイル削除**

```bash
rm ig-auto-poster/src/content-generator.ts \
   ig-auto-poster/src/content-generator-v2.ts \
   ig-auto-poster/src/content-generator-v3.ts \
   ig-auto-poster/src/caption-generator.ts \
   ig-auto-poster/src/captions.ts \
   ig-auto-poster/src/content-data.ts \
   ig-auto-poster/src/pdca-engine.ts \
   ig-auto-poster/src/photo-search.ts \
   ig-auto-poster/src/unsplash.ts \
   ig-auto-poster/src/satori-types.ts
```

- [ ] **Step 3: tsc --noEmit で型チェック**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: 全テスト実行**

Run: `cd ig-auto-poster && npx vitest run`
Expected: 全テストPASS

- [ ] **Step 5: コミット**

```bash
git add -A ig-auto-poster/
git commit -m "refactor: 旧v1-v3モジュール削除、v4パイプラインに完全移行"
```

- [ ] **Step 6: デプロイ**

Run: `cd ig-auto-poster && npx wrangler deploy`
Expected: デプロイ成功

- [ ] **Step 7: GH Actions secretsの設定確認**

必要なsecrets一覧:
- `GROQ_API_KEY`
- `NOTION_API_KEY`
- `NOTION_KNOWLEDGE_DB_ID`
- `NOTION_BUZZ_FORMATS_DB_ID`
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`
- `D1_DATABASE_ID`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_OWNER_USER_ID`
- `IG_ACCESS_TOKEN`
- `IG_BUSINESS_ACCOUNT_ID`

- [ ] **Step 8: コミット+push**

```bash
git push origin main
```

---

## Task 15: 初回バッチ実行テスト

- [ ] **Step 1: GH Actionsで手動実行**

Run: `gh workflow run ig-weekly-batch.yml`
Expected: ワークフロー起動

- [ ] **Step 2: 実行ログ確認**

Run: `gh run list --workflow=ig-weekly-batch.yml --limit=1`
Expected: status: completed / conclusion: success

- [ ] **Step 3: D1にスケジュールキューが登録されたか確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --remote --command="SELECT id, content_type, scheduled_date, status FROM schedule_queue ORDER BY id DESC LIMIT 10"`
Expected: 7件のpending投稿

- [ ] **Step 4: LINE通知の受信確認**

Expected: プレビュー画像+承認ボタンがLINEに届いている

- [ ] **Step 5: 承認テスト**

LINEで「一括承認」ボタンをタップ

- [ ] **Step 6: 承認後のステータス確認**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --remote --command="SELECT id, status FROM schedule_queue ORDER BY id DESC LIMIT 10"`
Expected: 7件がapproved

- [ ] **Step 7: progress.mdに記録**

```bash
date +%H:%M
```
→ `.company/secretary/notes/YYYY-MM-DD-progress.md` に結果を追記
