# IG Auto Poster v2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade ig-auto-poster from English learning carousels to Bali island info carousels sourced from knowledge DB + Unsplash photos, with weekly engagement measurement and automatic category weight optimization based on Instagram saves.

**Architecture:** knowledge-collector feeds Bali info into D1 knowledge DB → content-generator-v2 picks topics by category weight, formats with Haiku, fetches Unsplash photos → Satori renders 8-slide carousel → gallery approval (Phase 1) or auto-approve (Phase 2) → IG publish → weekly insights cron measures saves → optimizer adjusts category weights → LINE weekly report.

**Tech Stack:** Cloudflare Workers (fetch handler), Satori + resvg-wasm, Anthropic API (Haiku), Unsplash API, D1, R2, Instagram Graph API, LINE Messaging API

---

## File Structure

```
ig-auto-poster/src/
├── index.ts                    # Modify: add gallery/insights routes, update Env, update Cron handler
├── content-generator-v2.ts     # Create: knowledge DB + weight-based content pipeline
├── unsplash.ts                 # Create: Unsplash API photo fetcher
├── insights.ts                 # Create: IG Insights API + performance recording
├── optimizer.ts                # Create: category weight optimization + LINE report
├── gallery.ts                  # Create: Web gallery HTML (SSR)
├── image-generator.ts          # Modify: add buildV2SlidesPng for BaliContentV2
├── instagram.ts                # No change
├── knowledge.ts                # No change
├── line-preview.ts             # No change
├── content-generator.ts        # Keep: fallback (no changes)
├── content-data.ts             # Keep: fallback (no changes)
├── captions.ts                 # Keep: fallback (no changes)
├── satori-types.ts             # No change
├── templates/
│   ├── styles.ts               # No change (v2 styles already added)
│   ├── base.ts                 # No change (photoBackground/baliLogo/numberBadge already added)
│   ├── bali-cover.ts           # No change (already implemented)
│   ├── bali-spot.ts            # No change (already implemented)
│   ├── bali-summary.ts         # No change (already implemented)
│   ├── bali-cta.ts             # No change (already implemented)
│   ├── index.ts                # Modify: add buildV2Slides function
│   └── [existing v1 templates] # Keep: fallback
└── migrations/
    └── 0006_v2_1.sql           # Create: category_weights, post_performance, ig_settings, alter generated_content

knowledge-collector/src/
└── watchlist.json              # Modify: add Bali info source URLs
```

---

### Task 1: DB Migration - v2.1 tables

**Files:**
- Create: `ig-auto-poster/migrations/0006_v2_1.sql`

- [ ] **Step 1: Create migration file**

```sql
-- カテゴリ別生成比率
CREATE TABLE IF NOT EXISTS category_weights (
  category TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.125,
  avg_saves REAL DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 初期データ（8カテゴリ均等配分）
INSERT OR IGNORE INTO category_weights (category, weight) VALUES
  ('cafe', 0.20),
  ('spot', 0.15),
  ('food', 0.15),
  ('beach', 0.10),
  ('lifestyle', 0.10),
  ('cost', 0.10),
  ('visa', 0.10),
  ('culture', 0.10);

-- 投稿パフォーマンス記録
CREATE TABLE IF NOT EXISTS post_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ig_media_id TEXT NOT NULL,
  category TEXT NOT NULL,
  saves INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_perf_category ON post_performance(category);
CREATE INDEX IF NOT EXISTS idx_post_perf_measured ON post_performance(measured_at);

-- 設定テーブル
CREATE TABLE IF NOT EXISTS ig_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO ig_settings (key, value) VALUES ('auto_approve', 'false');

-- generated_contentにcategoryカラム追加
ALTER TABLE generated_content ADD COLUMN category TEXT DEFAULT NULL;
```

- [ ] **Step 2: Run migration on remote D1**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --remote --file=migrations/0006_v2_1.sql`
Expected: `Executed N commands` with success

- [ ] **Step 3: Verify tables exist**

Run: `cd ig-auto-poster && npx wrangler d1 execute ig-auto-poster-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('category_weights','post_performance','ig_settings') ORDER BY name"`
Expected: 3 rows returned

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/migrations/0006_v2_1.sql
git commit -m "feat(ig-auto-poster): add v2.1 migration - category weights, performance, settings"
```

---

### Task 2: Unsplash Photo Fetcher

**Files:**
- Create: `ig-auto-poster/src/unsplash.ts`
- Modify: `ig-auto-poster/src/index.ts` (Env interface)

- [ ] **Step 1: Create unsplash.ts**

```typescript
const UNSPLASH_API = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  urls: { raw: string; full: string; regular: string };
  user: { name: string; username: string };
  alt_description: string | null;
}

export interface PhotoResult {
  imageUrl: string;
  attribution: string;
}

export async function searchPhoto(
  query: string,
  accessKey: string,
): Promise<PhotoResult | null> {
  const params = new URLSearchParams({
    query,
    per_page: "5",
    orientation: "portrait",
    content_filter: "high",
  });

  const res = await fetch(`${UNSPLASH_API}/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    console.error(`Unsplash search failed: ${res.status}`);
    return null;
  }

  const data = await res.json() as { results: UnsplashPhoto[] };
  if (data.results.length === 0) return null;

  const photo = data.results[Math.floor(Math.random() * data.results.length)];
  const imageUrl = `${photo.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy`;
  const attribution = `Photo by ${photo.user.name} on Unsplash`;

  return { imageUrl, attribution };
}

export async function searchPhotosForSpots(
  spots: { name: string; area: string }[],
  coverQuery: string,
  accessKey: string,
): Promise<{ cover: PhotoResult | null; spots: (PhotoResult | null)[] }> {
  const cover = await searchPhoto(`${coverQuery} Bali`, accessKey);

  const spotPhotos: (PhotoResult | null)[] = [];
  for (const spot of spots) {
    const photo = await searchPhoto(
      `${spot.name} ${spot.area} Bali`,
      accessKey,
    );
    if (!photo) {
      const fallback = await searchPhoto(`${spot.area} Bali`, accessKey);
      spotPhotos.push(fallback);
    } else {
      spotPhotos.push(photo);
    }
  }

  return { cover, spots: spotPhotos };
}
```

- [ ] **Step 2: Add UNSPLASH_ACCESS_KEY to Env interface in index.ts**

In `ig-auto-poster/src/index.ts`, add `UNSPLASH_ACCESS_KEY: string;` to the `Env` interface after `LINE_OWNER_USER_ID`:

```typescript
export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  ANTHROPIC_API_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
  UNSPLASH_ACCESS_KEY: string;
}
```

- [ ] **Step 3: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors (unsplash.ts is standalone, index.ts just adds to Env)

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/src/unsplash.ts ig-auto-poster/src/index.ts
git commit -m "feat(ig-auto-poster): add Unsplash photo fetcher"
```

---

### Task 3: V2 Template Routing in templates/index.ts

**Files:**
- Modify: `ig-auto-poster/src/templates/index.ts`

- [ ] **Step 1: Add v2 slide builder**

Add these imports and the `buildV2Slides` function at the end of `ig-auto-poster/src/templates/index.ts`:

```typescript
import { buildBaliCoverNode, type BaliCoverData } from "./bali-cover";
import { buildBaliSpotNode, type BaliSpotData } from "./bali-spot";
import { buildBaliSummaryNode, type BaliSummaryData } from "./bali-summary";
import { buildBaliCtaNode } from "./bali-cta";

export interface BaliContentV2 {
  category: string;
  area: string;
  title: string;
  coverData: BaliCoverData;
  spotsData: BaliSpotData[];
  summaryData: BaliSummaryData;
  caption: string;
  attributions: string[];
}

export function buildV2Slides(content: BaliContentV2): SatoriNode[] {
  const nodes: SatoriNode[] = [];

  // 1. カバー
  nodes.push(buildBaliCoverNode(content.coverData));

  // 2-6. スポット詳細
  for (const spot of content.spotsData) {
    nodes.push(buildBaliSpotNode(spot));
  }

  // 7. まとめ
  nodes.push(buildBaliSummaryNode(content.summaryData));

  // 8. CTA
  nodes.push(buildBaliCtaNode());

  return nodes;
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/templates/index.ts
git commit -m "feat(ig-auto-poster): add v2 slide builder for Bali content"
```

---

### Task 4: V2 Image Generator Extension

**Files:**
- Modify: `ig-auto-poster/src/image-generator.ts`

- [ ] **Step 1: Add v2 PNG generation functions**

Add these imports and functions at the end of `ig-auto-poster/src/image-generator.ts`:

```typescript
import { buildV2Slides, type BaliContentV2 } from "./templates/index";

/** V2: バリ情報カルーセルの全スライドをPNG配列で返す */
export async function generateV2SlideImages(content: BaliContentV2): Promise<Uint8Array[]> {
  const nodes = buildV2Slides(content);
  const pngs: Uint8Array[] = [];
  for (const node of nodes) {
    const svg = await renderNodeToSvg(node);
    const png = await svgToPng(svg);
    pngs.push(png);
  }
  return pngs;
}

/** V2: 1枚だけPNG変換（プレビュー用） */
export async function generateV2SinglePng(content: BaliContentV2, slideIndex: number): Promise<Uint8Array> {
  const nodes = buildV2Slides(content);
  if (slideIndex >= nodes.length) throw new Error(`V2 slide index ${slideIndex} out of range (total: ${nodes.length})`);
  const svg = await renderNodeToSvg(nodes[slideIndex]);
  return svgToPng(svg);
}

/** V2: スライド総数 */
export function getV2SlideCount(content: BaliContentV2): number {
  return buildV2Slides(content).length;
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/image-generator.ts
git commit -m "feat(ig-auto-poster): add v2 image generation for Bali content"
```

---

### Task 5: Content Generator V2 (Knowledge DB + Haiku + Unsplash)

**Files:**
- Create: `ig-auto-poster/src/content-generator-v2.ts`

- [ ] **Step 1: Create content-generator-v2.ts**

```typescript
import { searchPhotosForSpots } from "./unsplash";
import { fetchKnowledge, fetchGuardrails, incrementUseCount, formatKnowledgeForPrompt } from "./knowledge";
import type { BaliCoverData } from "./templates/bali-cover";
import type { BaliSpotData } from "./templates/bali-spot";
import type { BaliSummaryData } from "./templates/bali-summary";
import type { BaliContentV2 } from "./templates/index";

interface SpotInfo {
  name: string;
  area: string;
  description: string;
  hours: string;
  oneLiner: string;
}

interface GeneratedTopic {
  category: string;
  area: string;
  catchCopy: string;
  mainTitle: string;
  countLabel: string;
  spots: SpotInfo[];
}

interface CategoryWeight {
  category: string;
  weight: number;
}

const CATEGORY_KNOWLEDGE_MAP: Record<string, { categories: string[]; tags: string[] }> = {
  cafe: { categories: ["locale"], tags: ["bali_cafe"] },
  spot: { categories: ["locale"], tags: ["bali_area"] },
  food: { categories: ["locale"], tags: ["bali_food", "bali_cafe"] },
  beach: { categories: ["locale"], tags: ["bali_area"] },
  lifestyle: { categories: ["locale", "case"], tags: ["bali_cost", "bali_lifestyle"] },
  cost: { categories: ["locale"], tags: ["bali_cost"] },
  visa: { categories: ["regulation"], tags: ["bali_visa"] },
  culture: { categories: ["locale"], tags: ["bali_culture"] },
};

const CATEGORY_PROMPTS: Record<string, string> = {
  cafe: "バリ島のおしゃれカフェ",
  spot: "バリ島の絶景・観光スポット",
  food: "バリ島のローカルフード・ワルン",
  beach: "バリ島のビーチ",
  lifestyle: "バリ島移住・暮らし",
  cost: "バリ島の物価・コスト",
  visa: "バリ島のビザ・手続き",
  culture: "バリ島の文化・お祭り・儀式",
};

const AREAS = ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア", "クタ", "ジンバラン", "ウルワツ"];

const SYSTEM_PROMPT = `あなたはバリ島在住の語学学校「バリリンガル」のInstagramコンテンツ作成者です。
バリ島のローカル情報を紹介するカルーセル投稿のテキストを作成します。
ターゲット: バリ島旅行に興味がある日本人（20-40代女性が中心）
トーン: カジュアルで親しみやすく、行きたくなるような紹介文

重要ルール:
- 提供された参考情報に基づいて書いてください
- 参考情報にないスポットを追加する場合は、実在が確認できるもののみ
- 営業時間が不明な場合はhoursを空文字にしてください
- 必ずJSON形式のみで返してください`;

/** カテゴリ比率に基づいてカテゴリを選択 */
async function selectCategory(db: D1Database): Promise<string> {
  const weights = await db
    .prepare("SELECT category, weight FROM category_weights ORDER BY weight DESC")
    .all<CategoryWeight>();

  const categories = weights.results;
  if (categories.length === 0) return "cafe";

  // 重み付きランダム選択
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;
  for (const cat of categories) {
    random -= cat.weight;
    if (random <= 0) return cat.category;
  }
  return categories[0].category;
}

/** Haiku APIでコンテンツ生成 */
async function generateWithHaiku(
  apiKey: string,
  category: string,
  knowledgeContext: string,
  pastTopics: string[],
): Promise<GeneratedTopic> {
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  const categoryDesc = CATEGORY_PROMPTS[category] ?? "バリ島情報";

  const pastList = pastTopics.length > 0
    ? `\n\n以下は既出テーマです。被らないようにしてください:\n${pastTopics.map((t) => `- ${t}`).join("\n")}`
    : "";

  const prompt = `「${area}の${categoryDesc}」をテーマにカルーセル投稿を作成してください。

${knowledgeContext ? `参考情報:\n${knowledgeContext}\n\n` : ""}JSON形式:
{
  "category": "${category}",
  "area": "${area}",
  "catchCopy": "${area}で行きたい！",
  "mainTitle": "キャッチーなタイトル",
  "countLabel": "5選",
  "spots": [
    {
      "name": "スポット名（実在するもの）",
      "area": "${area}",
      "description": "紹介文（100-150文字、3-4文）",
      "hours": "営業時間（不明なら空文字）",
      "oneLiner": "一言紹介（15文字以内）"
    }
  ]
}

spots は必ず5件。${pastList}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Haiku API error: ${res.status}`);
  }

  const data = await res.json() as { content: { type: string; text: string }[] };
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Haiku returned no text");

  return JSON.parse(textBlock.text) as GeneratedTopic;
}

function generateCaption(topic: GeneratedTopic, attributions: string[]): string {
  const spotList = topic.spots
    .map((s, i) => `${i + 1}. ${s.name}｜${s.oneLiner}`)
    .join("\n");

  const areaTag = topic.area ? `#${topic.area.replace(/ー/g, "")}` : "";
  const categoryTags: Record<string, string> = {
    cafe: "#バリ島カフェ",
    spot: "#バリ島観光",
    food: "#バリ島グルメ",
    beach: "#バリ島ビーチ",
    lifestyle: "#バリ島移住",
    cost: "#バリ島物価",
    visa: "#バリ島ビザ",
    culture: "#バリ島文化",
  };
  const catTag = categoryTags[topic.category] ?? "#バリ島";
  const hashtags = `#バリ島 #バリ旅行 ${catTag} ${areaTag} #バリ島留学 #バリリンガル #海外旅行 #インドネシア #バリ島情報 #バリ島おすすめ`;

  const attrLine = attributions.length > 0
    ? `\n\n📷 ${attributions.join(" / ")}`
    : "";

  return `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}\n\n${spotList}\n\n保存してバリ旅行の参考にしてね！\n友達にもシェアしてね\n\n${hashtags}${attrLine}`;
}

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1350&fit=crop";

export async function generateBaliContent(
  anthropicKey: string,
  unsplashKey: string,
  db: D1Database,
): Promise<BaliContentV2> {
  // 1. カテゴリ選択（比率ベース）
  const category = await selectCategory(db);

  // 2. 知識DB参照
  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };
  const entries = await fetchKnowledge(db, mapping.categories, mapping.tags);
  const guardrails = await fetchGuardrails(db, "ig");
  const knowledgeContext = formatKnowledgeForPrompt(entries, guardrails);

  // 3. 過去のテーマ取得（重複回避）
  const pastRows = await db
    .prepare("SELECT category || ':' || COALESCE(area,'') || ':' || COALESCE(theme,'') as topic FROM posted_topics ORDER BY id DESC LIMIT 30")
    .all<{ topic: string }>();
  const pastTopics = pastRows.results.map((r) => r.topic);

  // 4. Haikuでコンテンツ生成
  const topic = await generateWithHaiku(anthropicKey, category, knowledgeContext, pastTopics);

  // 5. 使用したナレッジエントリのカウントアップ
  if (entries.length > 0) {
    await incrementUseCount(db, entries.map((e) => e.id));
  }

  // 6. Unsplashで写真取得
  const photos = await searchPhotosForSpots(
    topic.spots.map((s) => ({ name: s.name, area: s.area })),
    topic.area || topic.mainTitle,
    unsplashKey,
  );

  // 7. テンプレートデータ組み立て
  const coverData: BaliCoverData = {
    imageUrl: photos.cover?.imageUrl ?? FALLBACK_IMAGE,
    catchCopy: topic.catchCopy,
    mainTitle: topic.mainTitle,
    countLabel: topic.countLabel,
  };

  const spotsData: BaliSpotData[] = topic.spots.map((spot, i) => ({
    imageUrl: photos.spots[i]?.imageUrl ?? FALLBACK_IMAGE,
    spotNumber: i + 1,
    spotName: spot.name,
    description: spot.description,
    hours: spot.hours || undefined,
  }));

  const summaryData: BaliSummaryData = {
    title: `${topic.catchCopy}${topic.mainTitle}`,
    spots: topic.spots.map((s, i) => ({
      number: i + 1,
      name: s.name,
      oneLiner: s.oneLiner,
    })),
  };

  const attributions = [
    photos.cover?.attribution,
    ...photos.spots.map((p) => p?.attribution),
  ].filter((a): a is string => !!a);
  const uniqueAttributions = [...new Set(attributions)];

  const caption = generateCaption(topic, uniqueAttributions);

  // 8. posted_topicsに記録
  await db
    .prepare("INSERT INTO posted_topics (category, area, theme, spots_json) VALUES (?, ?, ?, ?)")
    .bind(category, topic.area, topic.mainTitle, JSON.stringify(topic.spots.map((s) => s.name)))
    .run();

  return {
    category,
    area: topic.area,
    title: `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}`,
    coverData,
    spotsData,
    summaryData,
    caption,
    attributions: uniqueAttributions,
  };
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/content-generator-v2.ts
git commit -m "feat(ig-auto-poster): add v2 content generator with knowledge DB + Haiku + Unsplash"
```

---

### Task 6: IG Insights Collector

**Files:**
- Create: `ig-auto-poster/src/insights.ts`

- [ ] **Step 1: Create insights.ts**

```typescript
const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

interface InsightsMetric {
  name: string;
  values: { value: number }[];
}

interface InsightsResponse {
  data: InsightsMetric[];
  error?: { message: string };
}

export interface PostMetrics {
  igMediaId: string;
  saves: number;
  likes: number;
  comments: number;
  reach: number;
}

/** 1投稿のInsightsを取得 */
async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
): Promise<PostMetrics | null> {
  const url = `${GRAPH_API_BASE}/${mediaId}/insights?metric=saved,likes,comments,reach&access_token=${accessToken}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Insights fetch failed for ${mediaId}: ${res.status}`);
    return null;
  }

  const data = await res.json() as InsightsResponse;
  if (data.error) {
    console.error(`Insights API error for ${mediaId}: ${data.error.message}`);
    return null;
  }

  const metrics: Record<string, number> = {};
  for (const m of data.data) {
    metrics[m.name] = m.values[0]?.value ?? 0;
  }

  return {
    igMediaId: mediaId,
    saves: metrics.saved ?? 0,
    likes: metrics.likes ?? 0,
    comments: metrics.comments ?? 0,
    reach: metrics.reach ?? 0,
  };
}

/**
 * 投稿後7日以上経過し、まだ計測していない投稿のInsightsを取得してDBに保存する。
 */
export async function collectInsights(
  db: D1Database,
  accessToken: string,
): Promise<PostMetrics[]> {
  // 投稿済みかつ7日以上経過かつ未計測の投稿を取得
  const rows = await db
    .prepare(`
      SELECT gc.id, gc.ig_media_id, gc.category
      FROM generated_content gc
      WHERE gc.status = 'posted'
        AND gc.ig_media_id IS NOT NULL
        AND gc.posted_at IS NOT NULL
        AND julianday('now') - julianday(gc.posted_at) >= 7
        AND NOT EXISTS (
          SELECT 1 FROM post_performance pp WHERE pp.ig_media_id = gc.ig_media_id
        )
      ORDER BY gc.posted_at ASC
      LIMIT 20
    `)
    .all<{ id: number; ig_media_id: string; category: string }>();

  const results: PostMetrics[] = [];

  for (const row of rows.results) {
    const metrics = await fetchMediaInsights(row.ig_media_id, accessToken);
    if (!metrics) continue;

    await db
      .prepare(`
        INSERT INTO post_performance (ig_media_id, category, saves, likes, comments, reach)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(row.ig_media_id, row.category, metrics.saves, metrics.likes, metrics.comments, metrics.reach)
      .run();

    results.push(metrics);
    console.log(`Insights collected: ${row.ig_media_id} (${row.category}) saves=${metrics.saves}`);
  }

  return results;
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/insights.ts
git commit -m "feat(ig-auto-poster): add IG Insights collector"
```

---

### Task 7: Category Optimizer + LINE Weekly Report

**Files:**
- Create: `ig-auto-poster/src/optimizer.ts`

- [ ] **Step 1: Create optimizer.ts**

```typescript
import { sendNotification } from "./line-preview";

interface CategoryScore {
  category: string;
  avgSaves: number;
  totalPosts: number;
  currentWeight: number;
}

/**
 * カテゴリ別スコアを算出し、比率を更新する。
 * - 投稿3件未満のカテゴリは最適化対象外
 * - 上位3カテゴリ: +0.05、下位2カテゴリ: -0.05
 * - 制約: 最低0.05、最大0.30
 * - 正規化して合計1.0
 */
export async function optimizeWeights(db: D1Database): Promise<CategoryScore[]> {
  // カテゴリ別の平均保存数を算出
  const scores = await db
    .prepare(`
      SELECT
        cw.category,
        cw.weight as currentWeight,
        COALESCE(AVG(pp.saves), 0) as avgSaves,
        COUNT(pp.id) as totalPosts
      FROM category_weights cw
      LEFT JOIN post_performance pp ON cw.category = pp.category
      GROUP BY cw.category
      ORDER BY avgSaves DESC
    `)
    .all<CategoryScore>();

  const categories = scores.results;
  if (categories.length === 0) return [];

  // 最適化対象（3件以上投稿があるカテゴリ）
  const optimizable = categories.filter((c) => c.totalPosts >= 3);
  if (optimizable.length < 3) {
    // 十分なデータがないので比率変更なし
    console.log(`Optimization skipped: only ${optimizable.length} categories have 3+ posts`);
    return categories;
  }

  // 上位3カテゴリ / 下位2カテゴリを特定
  const sorted = [...optimizable].sort((a, b) => b.avgSaves - a.avgSaves);
  const top3 = new Set(sorted.slice(0, 3).map((c) => c.category));
  const bottom2 = new Set(sorted.slice(-2).map((c) => c.category));

  // 比率更新
  const newWeights: { category: string; weight: number }[] = [];
  for (const cat of categories) {
    let weight = cat.currentWeight;
    if (top3.has(cat.category)) weight += 0.05;
    if (bottom2.has(cat.category)) weight -= 0.05;
    weight = Math.max(0.05, Math.min(0.30, weight));
    newWeights.push({ category: cat.category, weight });
  }

  // 正規化
  const totalWeight = newWeights.reduce((sum, c) => sum + c.weight, 0);
  for (const w of newWeights) {
    w.weight = Math.round((w.weight / totalWeight) * 100) / 100;
  }

  // DB更新
  for (const w of newWeights) {
    const score = categories.find((c) => c.category === w.category);
    await db
      .prepare("UPDATE category_weights SET weight = ?, avg_saves = ?, total_posts = ?, updated_at = datetime('now') WHERE category = ?")
      .bind(w.weight, score?.avgSaves ?? 0, score?.totalPosts ?? 0, w.category)
      .run();
  }

  console.log("Weights updated:", newWeights);
  return categories;
}

/** LINE週次レポート送信 */
export async function sendWeeklyReport(
  scores: CategoryScore[],
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  const sorted = [...scores].sort((a, b) => b.avgSaves - a.avgSaves);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  const ranking = sorted
    .map((c, i) => `${i + 1}. ${c.category}: 平均${Math.round(c.avgSaves)}保存 (${c.totalPosts}件)`)
    .join("\n");

  const totalSaves = sorted.reduce((sum, c) => sum + c.avgSaves * c.totalPosts, 0);
  const totalPosts = sorted.reduce((sum, c) => sum + c.totalPosts, 0);

  const text = `IG週次レポート (${formatDate(weekAgo)}〜${formatDate(now)})

カテゴリ別保存数:
${ranking}

総投稿数: ${totalPosts}本
推定総保存数: ${Math.round(totalSaves)}`;

  await sendNotification(text, userId, channelAccessToken);
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/optimizer.ts
git commit -m "feat(ig-auto-poster): add category optimizer and LINE weekly report"
```

---

### Task 8: Web Gallery (SSR HTML)

**Files:**
- Create: `ig-auto-poster/src/gallery.ts`

- [ ] **Step 1: Create gallery.ts**

```typescript
interface GalleryItem {
  id: number;
  category: string | null;
  content_json: string;
  caption: string;
  status: string;
  created_at: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** GET /gallery - コンテンツ一覧 */
export async function renderGalleryList(db: D1Database, filter?: string): Promise<string> {
  const where = filter ? `WHERE status = '${filter}'` : "";
  const rows = await db
    .prepare(`SELECT id, category, content_json, caption, status, created_at FROM generated_content ${where} ORDER BY id DESC LIMIT 50`)
    .all<GalleryItem>();

  const items = rows.results.map((row) => {
    const parsed = JSON.parse(row.content_json);
    const title = parsed.title ?? parsed.coverData?.catchCopy ?? "Untitled";
    const statusBadge: Record<string, string> = {
      pending_review: "🟡 レビュー待ち",
      approved: "🟢 承認済み",
      posted: "✅ 投稿済み",
      skipped: "⏭ スキップ",
      rejected: "❌ 却下",
    };
    return `<div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:8px 0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${escapeHtml(String(title))}</strong>
        <span>${statusBadge[row.status] ?? row.status}</span>
      </div>
      <div style="color:#666;font-size:14px;margin-top:4px">
        ${row.category ? `カテゴリ: ${escapeHtml(row.category)} | ` : ""}${escapeHtml(row.created_at)}
      </div>
      <div style="margin-top:8px">
        <a href="/gallery/${row.id}" style="color:#E67E22">プレビュー →</a>
        ${row.status === "pending_review" ? `
          <form method="POST" action="/gallery/${row.id}/approve" style="display:inline;margin-left:16px">
            <button type="submit" style="background:#4CAF50;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer">承認</button>
          </form>
          <form method="POST" action="/gallery/${row.id}/skip" style="display:inline;margin-left:8px">
            <button type="submit" style="background:#999;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer">スキップ</button>
          </form>
        ` : ""}
      </div>
    </div>`;
  }).join("");

  const filterLinks = ["all", "pending_review", "approved", "posted", "skipped"]
    .map((f) => `<a href="/gallery${f === "all" ? "" : `?filter=${f}`}" style="margin-right:12px;${filter === f || (!filter && f === "all") ? "font-weight:bold" : ""}">${f}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IG Gallery</title>
<style>body{font-family:sans-serif;max-width:600px;margin:0 auto;padding:16px}a{color:#E67E22;text-decoration:none}</style>
</head><body>
<h1>IG Auto Poster Gallery</h1>
<div style="margin-bottom:16px">${filterLinks}</div>
${items || "<p>コンテンツがありません</p>"}
</body></html>`;
}

/** GET /gallery/:id - 詳細プレビュー（カバー画像URL付き） */
export async function renderGalleryDetail(db: D1Database, id: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT id, category, content_json, caption, status, created_at FROM generated_content WHERE id = ?")
    .bind(id)
    .first<GalleryItem>();

  if (!row) return null;

  const parsed = JSON.parse(row.content_json);
  const title = parsed.title ?? "Untitled";
  const coverUrl = parsed.coverUrl ?? "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(String(title))}</title>
<style>body{font-family:sans-serif;max-width:600px;margin:0 auto;padding:16px}img{max-width:100%;border-radius:8px}a{color:#E67E22;text-decoration:none}</style>
</head><body>
<a href="/gallery">← 一覧に戻る</a>
<h1>${escapeHtml(String(title))}</h1>
<p>カテゴリ: ${escapeHtml(row.category ?? "N/A")} | ステータス: ${escapeHtml(row.status)}</p>
${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="cover">` : ""}
<h2>キャプション</h2>
<pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px">${escapeHtml(row.caption)}</pre>
${row.status === "pending_review" ? `
<div style="margin-top:16px;display:flex;gap:8px">
  <form method="POST" action="/gallery/${row.id}/approve">
    <button type="submit" style="background:#4CAF50;color:#fff;border:none;padding:12px 32px;border-radius:8px;cursor:pointer;font-size:16px">承認する</button>
  </form>
  <form method="POST" action="/gallery/${row.id}/skip">
    <button type="submit" style="background:#999;color:#fff;border:none;padding:12px 32px;border-radius:8px;cursor:pointer;font-size:16px">スキップ</button>
  </form>
</div>
` : ""}
<h2>Raw JSON</h2>
<details><summary>展開</summary>
<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>
</details>
</body></html>`;
}
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/gallery.ts
git commit -m "feat(ig-auto-poster): add web gallery for content review"
```

---

### Task 9: Wire Up V2 in index.ts

**Files:**
- Modify: `ig-auto-poster/src/index.ts`

This is the integration task. The complete updated `index.ts` replaces the existing file.

- [ ] **Step 1: Replace index.ts with v2.1 version**

Replace the entire content of `ig-auto-poster/src/index.ts` with:

```typescript
import { generateSlideImages, generateFirstSlideSvg, generateSingleSlidePng, getSlideCount, generateV2SlideImages, generateV2SinglePng, getV2SlideCount } from "./image-generator";
import { publishCarousel } from "./instagram";
import { getCaption } from "./captions";
import { allContent } from "./content-data";
import { generateContent } from "./content-generator";
import { generateBaliContent } from "./content-generator-v2";
import { sendPreview, sendNotification, parsePostback } from "./line-preview";
import { collectInsights } from "./insights";
import { optimizeWeights, sendWeeklyReport } from "./optimizer";
import { renderGalleryList, renderGalleryDetail } from "./gallery";
import type { ContentItem } from "./content-data";
import type { BaliContentV2 } from "./templates/index";
import { fetchKnowledge, fetchGuardrails, formatKnowledgeForPrompt } from "./knowledge";
import type { KnowledgeEntry } from "./knowledge";

export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  ANTHROPIC_API_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
  UNSPLASH_ACCESS_KEY: string;
}

// --- 既存データ用ヘルパー（フォールバック） ---
async function getContentIndex(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT content_index FROM ig_post_state WHERE id = 1")
    .first<{ content_index: number }>();
  return row?.content_index ?? 0;
}

async function updateContentIndex(db: D1Database, newIndex: number): Promise<void> {
  await db
    .prepare("UPDATE ig_post_state SET content_index = ?, last_posted_at = datetime('now') WHERE id = 1")
    .bind(newIndex)
    .run();
}

// --- 設定取得ヘルパー ---
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM ig_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

// --- PNG画像1枚生成+R2保存（v1用） ---
async function generateAndStoreSingleImage(
  content: ContentItem,
  slideIndex: number,
  env: Env,
  prefix: string,
  timestamp: number,
): Promise<string> {
  const png = await generateSingleSlidePng(content, slideIndex);
  const key = `${prefix}/${timestamp}/slide-${slideIndex + 1}.png`;
  await env.IMAGES.put(key, png, {
    httpMetadata: { contentType: "image/png" },
  });
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// --- V2 PNG画像1枚生成+R2保存 ---
async function generateAndStoreV2Image(
  content: BaliContentV2,
  slideIndex: number,
  env: Env,
  prefix: string,
  timestamp: number,
): Promise<string> {
  const png = await generateV2SinglePng(content, slideIndex);
  const key = `${prefix}/${timestamp}/slide-${slideIndex + 1}.png`;
  await env.IMAGES.put(key, png, {
    httpMetadata: { contentType: "image/png" },
  });
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// --- V2 Cronハンドラー ---
async function handleV2GenerateCron(env: Env): Promise<void> {
  const content = await generateBaliContent(
    env.ANTHROPIC_API_KEY,
    env.UNSPLASH_ACCESS_KEY,
    env.DB,
  );
  const timestamp = Date.now();

  // プレビュー用カバー1枚
  const coverUrl = await generateAndStoreV2Image(content, 0, env, "preview", timestamp);

  // DBに保存
  await env.DB
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status, category) VALUES ('bali_v2', ?, ?, ?, ?)")
    .bind(
      JSON.stringify({ ...content, coverUrl }),
      content.caption,
      (await getSetting(env.DB, "auto_approve")) === "true" ? "approved" : "pending_review",
      content.category,
    )
    .run();

  const autoApprove = await getSetting(env.DB, "auto_approve");
  if (autoApprove !== "true") {
    // Phase 1: LINE通知（ギャラリーへ誘導）
    await sendNotification(
      `新しい投稿が生成されました\nテーマ: ${content.title}\nカテゴリ: ${content.category}\nギャラリーで確認: /gallery`,
      env.LINE_OWNER_USER_ID,
      env.LINE_CHANNEL_ACCESS_TOKEN,
    );
  }

  console.log(`V2 content generated: ${content.title} (${content.category})`);
}

async function handleV2PostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption, category FROM generated_content WHERE status = 'approved' AND template_type = 'bali_v2' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string; category: string }>();

  if (!row) {
    // v2承認済みなし → v1フォールバック
    console.log("No approved v2 content. Using v1 fallback.");
    const contentIndex = await getContentIndex(env.DB);
    const content = allContent[contentIndex % allContent.length];
    const timestamp = Date.now();
    const total = getSlideCount(content);
    const imageUrls: string[] = [];
    for (let i = 0; i < total; i++) {
      const url = await generateAndStoreSingleImage(content, i, env, "auto", timestamp);
      imageUrls.push(url);
    }
    const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);
    await publishCarousel(imageUrls, caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
    await updateContentIndex(env.DB, (contentIndex + 1) % allContent.length);
    console.log(`V1 fallback posted: ${content.title}`);
    return;
  }

  const stored = JSON.parse(row.content_json) as BaliContentV2 & { coverUrl: string };
  const timestamp = Date.now();
  const total = getV2SlideCount(stored);
  const imageUrls: string[] = [];
  for (let i = 0; i < total; i++) {
    const url = await generateAndStoreV2Image(stored, i, env, "post", timestamp);
    imageUrls.push(url);
  }
  const publishedId = await publishCarousel(imageUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?")
    .bind(publishedId, row.id)
    .run();

  await sendNotification(
    `投稿完了: ${stored.title}\nカテゴリ: ${row.category}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`V2 posted: ${stored.title} (${row.category}) ig_media_id=${publishedId}`);
}

// --- 週次Insights + 最適化 ---
async function handleWeeklyInsightsCron(env: Env): Promise<void> {
  console.log("Weekly insights collection started");

  const metrics = await collectInsights(env.DB, env.IG_ACCESS_TOKEN);
  console.log(`Collected insights for ${metrics.length} posts`);

  const scores = await optimizeWeights(env.DB);
  await sendWeeklyReport(scores, env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);

  console.log("Weekly insights and optimization complete");
}

// --- LINE Webhookハンドラー ---
interface LineWebhookEvent {
  type: string;
  message?: { type: string; text?: string };
  postback?: { data: string };
  source?: { userId: string };
}

async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { events: LineWebhookEvent[] };

  for (const event of body.events) {
    if (event.type !== "postback" || !event.postback) continue;
    if (event.source?.userId !== env.LINE_OWNER_USER_ID) continue;

    const parsed = parsePostback(event.postback.data);
    if (!parsed) continue;

    switch (parsed.action) {
      case "approve": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'approved' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await sendNotification("承認しました。次の投稿時間に自動投稿します。", env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
        break;
      }
      case "regenerate": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'rejected' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await handleV2GenerateCron(env);
        break;
      }
      case "skip": {
        await env.DB
          .prepare("UPDATE generated_content SET status = 'skipped' WHERE id = ?")
          .bind(parsed.id)
          .run();
        await sendNotification("スキップしました。", env.LINE_OWNER_USER_ID, env.LINE_CHANNEL_ACCESS_TOKEN);
        break;
      }
    }
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "Content-Type": "application/json" },
  });
}

// --- メインエクスポート ---
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const hour = new Date(controller.scheduledTime).getUTCHours();
    const dayOfWeek = new Date(controller.scheduledTime).getUTCDay();

    // 毎週月曜 UTC 2:00 (バリ時間10:00) → Insights + 最適化
    if (dayOfWeek === 1 && hour === 2) {
      await handleWeeklyInsightsCron(env);
      return;
    }

    // 日次: UTC 0,8 → V2コンテンツ生成
    if (hour === 0 || hour === 8) {
      await handleV2GenerateCron(env);
    }
    // 日次: UTC 1,10 → V2投稿
    else if (hour === 1 || hour === 10) {
      await handleV2PostCron(env);
    }
  },

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const html = (body: string, status = 200) =>
      new Response(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

    try {
      // --- LINE Webhook ---
      if (request.method === "POST" && url.pathname === "/line-webhook") {
        return handleLineWebhook(request, env);
      }

      // --- Gallery ---
      if (request.method === "GET" && url.pathname === "/gallery") {
        const filter = url.searchParams.get("filter") ?? undefined;
        return html(await renderGalleryList(env.DB, filter));
      }

      if (request.method === "GET" && url.pathname.match(/^\/gallery\/\d+$/)) {
        const id = parseInt(url.pathname.split("/")[2], 10);
        const page = await renderGalleryDetail(env.DB, id);
        if (!page) return html("<p>Not found</p>", 404);
        return html(page);
      }

      if (request.method === "POST" && url.pathname.match(/^\/gallery\/\d+\/(approve|skip)$/)) {
        const parts = url.pathname.split("/");
        const id = parseInt(parts[2], 10);
        const action = parts[3];
        const newStatus = action === "approve" ? "approved" : "skipped";
        await env.DB
          .prepare("UPDATE generated_content SET status = ? WHERE id = ?")
          .bind(newStatus, id)
          .run();
        return Response.redirect(`${url.origin}/gallery`, 303);
      }

      // --- Status ---
      if (request.method === "GET" && url.pathname === "/status") {
        const index = await getContentIndex(env.DB);
        const row = await env.DB
          .prepare("SELECT last_posted_at FROM ig_post_state WHERE id = 1")
          .first<{ last_posted_at: string | null }>();
        const pendingCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'pending_review'")
          .first<{ count: number }>();
        const approvedCount = await env.DB
          .prepare("SELECT COUNT(*) as count FROM generated_content WHERE status = 'approved'")
          .first<{ count: number }>();
        const weights = await env.DB
          .prepare("SELECT category, weight, avg_saves, total_posts FROM category_weights ORDER BY weight DESC")
          .all<{ category: string; weight: number; avg_saves: number; total_posts: number }>();
        const autoApprove = await getSetting(env.DB, "auto_approve");
        return json({
          version: "v2.1",
          contentIndex: index,
          totalFallbackContent: allContent.length,
          lastPostedAt: row?.last_posted_at,
          pendingReview: pendingCount?.count ?? 0,
          approved: approvedCount?.count ?? 0,
          autoApprove: autoApprove === "true",
          categoryWeights: weights.results,
        });
      }

      // --- Manual triggers ---
      if (request.method === "POST" && url.pathname === "/generate") {
        await handleV2GenerateCron(env);
        return json({ success: true, message: "V2 content generated" });
      }

      if (request.method === "POST" && url.pathname === "/collect-insights") {
        await handleWeeklyInsightsCron(env);
        return json({ success: true, message: "Insights collected and weights optimized" });
      }

      // --- Settings ---
      if (request.method === "POST" && url.pathname === "/settings/auto-approve") {
        const body = await request.json() as { enabled: boolean };
        await env.DB
          .prepare("UPDATE ig_settings SET value = ? WHERE key = 'auto_approve'")
          .bind(body.enabled ? "true" : "false")
          .run();
        return json({ success: true, autoApprove: body.enabled });
      }

      // --- R2 images ---
      if (request.method === "GET" && url.pathname.startsWith("/images/")) {
        const key = url.pathname.replace("/images/", "");
        const object = await env.IMAGES.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "image/png",
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }

      // --- Knowledge DB API (unchanged) ---
      if (request.method === "GET" && url.pathname === "/api/knowledge") {
        const category = url.searchParams.get("category");
        const tagsParam = url.searchParams.get("tags");
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const categories = category ? category.split(",") : [];
        const tags = tagsParam ? tagsParam.split(",") : [];

        if (categories.length === 0) {
          const counts = await env.DB
            .prepare("SELECT category, COUNT(*) as count FROM knowledge_entries GROUP BY category")
            .all<{ category: string; count: number }>();
          const guardrailCount = await env.DB
            .prepare("SELECT COUNT(*) as count FROM content_guardrails")
            .first<{ count: number }>();
          return json({ categories: counts.results, guardrails: guardrailCount?.count ?? 0 });
        }

        const entries = await fetchKnowledge(env.DB, categories, tags, limit);
        const guardrails = await fetchGuardrails(env.DB, url.searchParams.get("platform") || "all");
        return json({ entries, guardrails });
      }

      if (request.method === "POST" && url.pathname === "/api/knowledge") {
        const body = await request.json() as {
          category: string;
          subcategory?: string;
          title: string;
          content: string;
          tags?: string;
          source?: string;
          reliability?: string;
          source_url?: string;
        };

        if (!body.category || !body.title || !body.content) {
          return json({ error: "category, title, content are required" }, 400);
        }

        const result = await env.DB
          .prepare(
            `INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability, source_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            body.category,
            body.subcategory || null,
            body.title,
            body.content,
            body.tags || null,
            body.source || "auto",
            body.reliability || "unverified",
            body.source_url || null
          )
          .run();

        return json({ success: true, id: result.meta.last_row_id });
      }

      // --- V1 legacy endpoints ---
      if (request.method === "GET" && url.pathname === "/content") {
        const list = allContent.map((c) => ({
          id: c.id, type: c.type, title: c.title.replaceAll("\n", " "),
        }));
        return json({ total: list.length, content: list });
      }

      return json({
        endpoints: [
          "GET  /status             - 現在の状態（v2.1）",
          "GET  /gallery            - コンテンツギャラリー",
          "GET  /gallery/:id        - コンテンツ詳細",
          "POST /gallery/:id/approve - 承認",
          "POST /gallery/:id/skip   - スキップ",
          "POST /generate           - V2コンテンツ手動生成",
          "POST /collect-insights   - Insights手動収集+最適化",
          "POST /settings/auto-approve - 自動承認切替 {enabled:bool}",
          "POST /line-webhook       - LINE Webhook",
          "GET  /api/knowledge      - 知識エントリ取得",
          "POST /api/knowledge      - 知識エントリ追加",
          "GET  /content            - V1ネタリスト（レガシー）",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
```

- [ ] **Step 2: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/index.ts
git commit -m "feat(ig-auto-poster): wire up v2.1 - gallery, insights, optimizer, v2 content pipeline"
```

---

### Task 10: Update Cron Schedule in wrangler.toml

**Files:**
- Modify: `ig-auto-poster/wrangler.toml`

- [ ] **Step 1: Add weekly insights cron**

Replace the `[triggers]` section in `ig-auto-poster/wrangler.toml`:

```toml
# Bali time (WITA UTC+8):
# 08:00 (UTC 00:00) - V2コンテンツ生成
# 09:00 (UTC 01:00) - 承認済み投稿
# 16:00 (UTC 08:00) - V2コンテンツ生成
# 18:00 (UTC 10:00) - 承認済み投稿
# 毎週月曜 10:00 (UTC 02:00) - Insights収集+最適化
[triggers]
crons = ["0 0,8 * * *", "0 1,10 * * *", "0 2 * * 1"]
```

- [ ] **Step 2: Commit**

```bash
git add ig-auto-poster/wrangler.toml
git commit -m "feat(ig-auto-poster): add weekly insights cron schedule"
```

---

### Task 11: Add Bali Info Sources to knowledge-collector

**Files:**
- Modify: `knowledge-collector/src/watchlist.json`

- [ ] **Step 1: Add Bali info sources**

Add the following entries to the end of the JSON array in `knowledge-collector/src/watchlist.json` (before the closing `]`):

```json
  ,
  {"url":"https://www.balinavigator.com/","category":"locale","subcategory":"bali_cafe","extract":"バリ島のカフェ・レストラン・観光スポット情報（店名、エリア、特徴、営業時間）"},
  {"url":"https://bali-club.jp/blog/","category":"locale","subcategory":"bali_area","extract":"バリ島のローカル情報・おすすめスポット・現地レポート"},
  {"url":"https://www.thebalibible.com/","category":"locale","subcategory":"bali_cafe","extract":"Bali cafes, restaurants, beach clubs, spas - names, areas, features"},
  {"url":"https://www.tripadvisor.com/Attractions-g294226-Activities-Bali.html","category":"locale","subcategory":"bali_area","extract":"バリ島の人気アトラクション・観光スポットランキング"},
  {"url":"https://www.klook.com/ja/city/14-bali/","category":"locale","subcategory":"bali_area","extract":"バリ島のアクティビティ・ツアー・人気スポット"},
  {"url":"https://id.imigrasi.go.id/","category":"regulation","subcategory":"bali_visa","extract":"インドネシアのビザ種類・申請方法・料金・規制変更"}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('knowledge-collector/src/watchlist.json','utf-8'));console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add knowledge-collector/src/watchlist.json
git commit -m "feat(knowledge-collector): add Bali info sources for IG content"
```

---

### Task 12: Set ANTHROPIC_API_KEY Secret and Deploy

**Files:**
- No file changes

- [ ] **Step 1: Set ANTHROPIC_API_KEY secret**

Run: `echo '<YOUR_KEY>' | npx wrangler secret put ANTHROPIC_API_KEY --name ig-auto-poster`

(User provides their actual Anthropic API key)

- [ ] **Step 2: Deploy**

Run: `cd ig-auto-poster && npx wrangler deploy`
Expected: `Published ig-auto-poster` with new version ID

- [ ] **Step 3: Verify /status endpoint**

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/status | jq .`
Expected: JSON with `version: "v2.1"`, `categoryWeights` with 8 categories, `autoApprove: false`

- [ ] **Step 4: Test V2 content generation**

Run: `curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/generate | jq .`
Expected: `{ "success": true, "message": "V2 content generated" }`

- [ ] **Step 5: Verify gallery**

Open in browser: `https://ig-auto-poster.archbridge24.workers.dev/gallery`
Expected: Gallery page with 1 pending_review item

- [ ] **Step 6: Commit deploy changes (if any lock file changes)**

```bash
git add -A ig-auto-poster/
git commit -m "chore(ig-auto-poster): deploy v2.1"
```

---

### Task 13: End-to-End Test - Approve and Post

**Files:**
- No file changes

- [ ] **Step 1: Approve content via gallery**

Open gallery in browser → click "承認する" on the pending item.
Or via API: `curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/gallery/<ID>/approve`

- [ ] **Step 2: Verify approved status**

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/status | jq .approved`
Expected: `1`

- [ ] **Step 3: Trigger manual post (if not waiting for cron)**

Note: The Cron will handle posting automatically. For immediate testing, manually trigger by waiting for the next Cron window or calling the scheduled handler via dashboard.

- [ ] **Step 4: Verify on Instagram**

Check @balilingirl Instagram account for the new Bali info carousel post.

- [ ] **Step 5: Record in progress.md**

```bash
date +%Y-%m-%d
date +%H:%M
```

Write a progress entry to `.company/secretary/notes/YYYY-MM-DD-progress.md` with the deployment results.
