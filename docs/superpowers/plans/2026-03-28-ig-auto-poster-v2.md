# IG Auto Poster v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace English learning carousels with Bali island local info carousels (cafes, spots, food) using real photos from Unsplash + text overlay, fully automated pipeline.

**Architecture:** New content generator uses Claude API to research Bali spots, Unsplash API fetches photos, new Satori templates render photo-background slides with text overlay. Web gallery replaces LINE for review/approval. Existing English learning code remains as fallback.

**Tech Stack:** Cloudflare Workers + Hono-less fetch handler, Satori + resvg-wasm, Claude API (Haiku), Unsplash API, D1, R2, Instagram Graph API

---

## File Structure

```
ig-auto-poster/src/
├── index.ts                    # Modify: add gallery management routes, update cron handlers
├── content-generator-v2.ts     # Create: Bali info content generation pipeline
├── unsplash.ts                 # Create: Unsplash API photo fetcher
├── image-generator.ts          # Modify: add photo-background slide generation
├── captions.ts                 # Modify: add Bali info caption generator
├── content-data.ts             # Keep: fallback (no changes)
├── content-generator.ts        # Keep: fallback (no changes)
├── instagram.ts                # Keep: no changes
├── line-preview.ts             # Keep: used for post-publish notification only
├── templates/
│   ├── styles.ts               # Modify: add v2 colors/constants
│   ├── base.ts                 # Modify: add photoBackground helper
│   ├── bali-cover.ts           # Create: cover template (photo bg + title overlay)
│   ├── bali-spot.ts            # Create: spot detail template (photo bg + info overlay)
│   ├── bali-summary.ts         # Create: summary/list template
│   ├── bali-cta.ts             # Create: CTA template
│   └── index.ts                # Modify: add v2 template routing
└── migrations/
    └── 0003_posted_topics.sql  # Create: posted_topics table
```

---

### Task 1: DB Migration - posted_topics table

**Files:**
- Create: `ig-auto-poster/migrations/0003_posted_topics.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Bali info投稿の重複回避テーブル
CREATE TABLE IF NOT EXISTS posted_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  area TEXT,
  theme TEXT,
  spots_json TEXT NOT NULL,
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posted_topics_category ON posted_topics(category);
```

- [ ] **Step 2: Run migration on remote D1**

Run: `npx wrangler d1 execute ig-auto-poster-db --remote --file=migrations/0003_posted_topics.sql`
Expected: `Executed 2 commands` with success

- [ ] **Step 3: Verify table exists**

Run: `npx wrangler d1 execute ig-auto-poster-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='posted_topics'"`
Expected: `[{"name":"posted_topics"}]`

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/migrations/0003_posted_topics.sql
git commit -m "feat(ig-auto-poster): add posted_topics migration for v2"
```

---

### Task 2: Unsplash Photo Fetcher

**Files:**
- Create: `ig-auto-poster/src/unsplash.ts`

- [ ] **Step 1: Create unsplash.ts**

```typescript
const UNSPLASH_API = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  urls: { raw: string; full: string; regular: string };
  user: { name: string; username: string };
  alt_description: string | null;
}

interface PhotoResult {
  imageUrl: string;
  attribution: string; // "Photo by Name on Unsplash"
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

  // ランダムに1枚選択（同じ写真ばかりにならないように）
  const photo = data.results[Math.floor(Math.random() * data.results.length)];

  // 1080x1350 (4:5) にcrop
  const imageUrl = `${photo.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy`;
  const attribution = `Photo by ${photo.user.name} on Unsplash`;

  return { imageUrl, attribution };
}

export async function searchPhotosForSpots(
  spots: { name: string; area: string }[],
  coverQuery: string,
  accessKey: string,
): Promise<{ cover: PhotoResult | null; spots: (PhotoResult | null)[] }> {
  // カバー写真
  const cover = await searchPhoto(`${coverQuery} Bali`, accessKey);

  // 各スポットの写真
  const spotPhotos: (PhotoResult | null)[] = [];
  for (const spot of spots) {
    const photo = await searchPhoto(
      `${spot.name} ${spot.area} Bali`,
      accessKey,
    );
    // スポット名で見つからなければエリア名で再検索
    if (!photo) {
      const fallback = await searchPhoto(`${spot.area} Bali cafe restaurant`, accessKey);
      spotPhotos.push(fallback);
    } else {
      spotPhotos.push(photo);
    }
  }

  return { cover, spots: spotPhotos };
}
```

- [ ] **Step 2: Add UNSPLASH_ACCESS_KEY to Env interface in index.ts**

Add `UNSPLASH_ACCESS_KEY: string;` to the `Env` interface in `ig-auto-poster/src/index.ts`.

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Set Unsplash secret**

The user needs to create a free Unsplash developer account at https://unsplash.com/developers and get an Access Key. Then:

Run: `echo '<ACCESS_KEY>' | npx wrangler secret put UNSPLASH_ACCESS_KEY --name ig-auto-poster`

- [ ] **Step 5: Commit**

```bash
git add ig-auto-poster/src/unsplash.ts ig-auto-poster/src/index.ts
git commit -m "feat(ig-auto-poster): add Unsplash photo fetcher"
```

---

### Task 3: V2 Template Styles and Base Helpers

**Files:**
- Modify: `ig-auto-poster/src/templates/styles.ts`
- Modify: `ig-auto-poster/src/templates/base.ts`

- [ ] **Step 1: Add v2 constants to styles.ts**

Add after existing constants:

```typescript
// --- V2: Bali Info Style ---
export const V2_COLORS = {
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.45)",
  overlayDark: "rgba(0,0,0,0.65)",
  orange: "#E67E22",
  orangeLight: "#F39C12",
} as const;

export const TEXT_SHADOW = "0 2px 8px rgba(0,0,0,0.7)";
```

- [ ] **Step 2: Add photoBackground helper to base.ts**

Add after `lightBackground` function:

```typescript
// V2: 写真背景（Satori img要素）
export function photoBackground(
  imageUrl: string,
  ...children: SatoriNode[]
): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      fontFamily: FONT_FAMILY,
      position: "relative",
      overflow: "hidden",
    },
  },
    // 背景画像
    h("img", {
      src: imageUrl,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        objectFit: "cover",
      },
    }),
    // コンテンツレイヤー
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        position: "relative",
      },
    }, ...children),
  );
}

// V2: Balilingualロゴ（上部）
export function baliLogo(): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      paddingTop: 32,
      paddingBottom: 8,
    },
  },
    h("span", {
      style: {
        fontSize: 36,
        fontWeight: 700,
        color: "white",
        fontFamily: FONT_FAMILY,
        textShadow: "0 2px 8px rgba(0,0,0,0.7)",
      },
    }, "Barilingual"),
  );
}

// V2: 番号バッジ（オレンジ丸）
export function numberBadge(label: string): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "#E67E22",
    },
  },
    h("span", {
      style: {
        fontSize: 32,
        fontWeight: 900,
        color: "white",
        fontFamily: FONT_FAMILY,
      },
    }, label),
  );
}
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/src/templates/styles.ts ig-auto-poster/src/templates/base.ts
git commit -m "feat(ig-auto-poster): add v2 styles and photo background helpers"
```

---

### Task 4: Bali Cover Template

**Files:**
- Create: `ig-auto-poster/src/templates/bali-cover.ts`

- [ ] **Step 1: Create bali-cover.ts**

```typescript
import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, baliLogo, numberBadge, wrapText } from "./base";

export interface BaliCoverData {
  imageUrl: string;
  catchCopy: string;    // e.g. "チャングーで行きたい！"
  mainTitle: string;    // e.g. "おしゃれカフェ"
  countLabel: string;   // e.g. "5選"
}

export function buildBaliCoverNode(data: BaliCoverData): SatoriNode {
  const catchLines = wrapText(data.catchCopy, {
    fontSize: 42,
    fontWeight: 700,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
    textAlign: "center",
  }, 18);

  const titleLines = wrapText(data.mainTitle, {
    fontSize: 72,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 3px 12px rgba(0,0,0,0.8)",
    textAlign: "center",
  }, 10);

  return photoBackground(data.imageUrl,
    // ロゴ
    baliLogo(),
    // メインコンテンツ（中央寄せ）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 16,
      },
    },
      // 白枠
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: "3px solid rgba(255,255,255,0.8)",
          borderRadius: 12,
          padding: "40px 60px",
          gap: 12,
        },
      },
        // キャッチコピー
        h("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center" },
        }, ...catchLines),
        // メインタイトル
        h("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center" },
        }, ...titleLines),
        // 数字バッジ
        numberBadge(data.countLabel),
      ),
    ),
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/templates/bali-cover.ts
git commit -m "feat(ig-auto-poster): add bali cover template"
```

---

### Task 5: Bali Spot Template

**Files:**
- Create: `ig-auto-poster/src/templates/bali-spot.ts`

- [ ] **Step 1: Create bali-spot.ts**

```typescript
import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, photoBackground, baliLogo, numberBadge, wrapText } from "./base";

export interface BaliSpotData {
  imageUrl: string;
  spotNumber: number;
  spotName: string;
  description: string;
  hours?: string;        // e.g. "8:00-16:30"
}

export function buildBaliSpotNode(data: BaliSpotData): SatoriNode {
  const descLines = wrapText(data.description, {
    fontSize: 34,
    fontWeight: 700,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 2px 6px rgba(0,0,0,0.7)",
    lineHeight: 1.5,
  }, 22);

  const nameLines = wrapText(data.spotName, {
    fontSize: 56,
    fontWeight: 900,
    color: "white",
    fontFamily: FONT_FAMILY,
    textShadow: "0 3px 10px rgba(0,0,0,0.8)",
    textAlign: "center",
  }, 14);

  return photoBackground(data.imageUrl,
    // ロゴ
    baliLogo(),
    // 番号バッジ
    h("div", {
      style: { display: "flex", paddingLeft: 40, paddingTop: 8 },
    }, numberBadge(String(data.spotNumber))),
    // 店名（上部中央）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        gap: 4,
      },
    }, ...nameLines),
    // スペーサー
    h("div", { style: { display: "flex", flex: 1 } }),
    // 下部: 半透明黒背景 + 紹介文
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "32px 40px 40px 40px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.7) 20%)",
      },
    },
      // 紹介文
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 2 },
      }, ...descLines),
      // 営業時間
      ...(data.hours ? [
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            marginTop: 12,
            gap: 8,
          },
        },
          h("span", {
            style: { fontSize: 28, color: "white", fontFamily: FONT_FAMILY, fontWeight: 700 },
          }, `⏰ ${data.hours}`),
        ),
      ] : []),
    ),
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/templates/bali-spot.ts
git commit -m "feat(ig-auto-poster): add bali spot template"
```

---

### Task 6: Bali Summary and CTA Templates

**Files:**
- Create: `ig-auto-poster/src/templates/bali-summary.ts`
- Create: `ig-auto-poster/src/templates/bali-cta.ts`

- [ ] **Step 1: Create bali-summary.ts**

```typescript
import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, baliLogo, wrapText } from "./base";

export interface BaliSummaryData {
  title: string;
  spots: { number: number; name: string; oneLiner: string }[];
}

export function buildBaliSummaryNode(data: BaliSummaryData): SatoriNode {
  const spotRows = data.spots.map((spot) =>
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#E67E22",
          flexShrink: 0,
        },
      },
        h("span", {
          style: { fontSize: 24, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, String(spot.number)),
      ),
      h("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
      },
        h("span", {
          style: { fontSize: 32, fontWeight: 900, color: "white", fontFamily: FONT_FAMILY },
        }, spot.name),
        h("span", {
          style: { fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: FONT_FAMILY },
        }, spot.oneLiner),
      ),
    ),
  );

  return tropicalBackground(
    baliLogo(),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "20px 48px",
        flex: 1,
      },
    },
      h("span", {
        style: {
          fontSize: 40,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
          marginBottom: 24,
        },
      }, "まとめ"),
      ...spotRows,
    ),
  );
}
```

- [ ] **Step 2: Create bali-cta.ts**

```typescript
import type { SatoriNode } from "../satori-types";
import { FONT_FAMILY, WIDTH, HEIGHT } from "./styles";
import { h, tropicalBackground, baliLogo, wrapText } from "./base";

export function buildBaliCtaNode(): SatoriNode {
  return tropicalBackground(
    baliLogo(),
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: 40,
        padding: "0 60px",
      },
    },
      h("span", {
        style: {
          fontSize: 48,
          fontWeight: 900,
          color: "white",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, "保存してバリ旅行の\n参考にしてね！"),
      // CTA button
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#E67E22",
          borderRadius: 50,
          padding: "20px 60px",
        },
      },
        h("span", {
          style: {
            fontSize: 36,
            fontWeight: 900,
            color: "white",
            fontFamily: FONT_FAMILY,
          },
        }, "フォローで最新情報をGET"),
      ),
      h("span", {
        style: {
          fontSize: 30,
          fontWeight: 700,
          color: "rgba(255,255,255,0.8)",
          fontFamily: FONT_FAMILY,
          textAlign: "center",
        },
      }, "バリ島のおすすめスポットを\n毎日配信中！"),
    ),
  );
}
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/src/templates/bali-summary.ts ig-auto-poster/src/templates/bali-cta.ts
git commit -m "feat(ig-auto-poster): add bali summary and CTA templates"
```

---

### Task 7: V2 Content Generator

**Files:**
- Create: `ig-auto-poster/src/content-generator-v2.ts`

- [ ] **Step 1: Create content-generator-v2.ts**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { searchPhotosForSpots } from "./unsplash";
import type { BaliCoverData } from "./templates/bali-cover";
import type { BaliSpotData } from "./templates/bali-spot";
import type { BaliSummaryData } from "./templates/bali-summary";

export interface BaliContentV2 {
  category: string;     // e.g. "cafe_canggu"
  area: string;         // e.g. "チャングー"
  title: string;        // e.g. "チャングーで行きたい！おしゃれカフェ5選"
  coverData: BaliCoverData;
  spotsData: BaliSpotData[];
  summaryData: BaliSummaryData;
  caption: string;
  attributions: string[];  // Unsplash attributions
}

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

const SYSTEM_PROMPT = `あなたはバリ島在住の語学学校「バリリンガル」のInstagramコンテンツ作成者です。
バリ島のローカル情報（カフェ、レストラン、スパ、観光スポット等）を紹介するカルーセル投稿を作成します。
ターゲット: バリ島旅行に興味がある日本人（20-40代女性が中心）
トーン: カジュアルで親しみやすく、行きたくなるような紹介文
実在するスポットの情報を正確に記載してください。

必ず以下のJSON形式で返してください。それ以外のテキストは含めないでください。`;

const CATEGORIES = [
  { category: "cafe", areas: ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア"] },
  { category: "restaurant", areas: ["チャングー", "ウブド", "スミニャック", "ジンバラン", "サヌール"] },
  { category: "spa", areas: ["ウブド", "スミニャック", "ヌサドゥア", "サヌール"] },
  { category: "spot", areas: ["ウブド", "チャングー", "ウルワツ", "クタ", "ヌサドゥア"] },
  { category: "beach", areas: ["チャングー", "クタ", "ジンバラン", "サヌール", "ヌサドゥア"] },
];

const THEMES = [
  { category: "theme_nusapenida", title: "ヌサペニダ日帰り" },
  { category: "theme_morning", title: "バリの朝活スポット" },
  { category: "theme_localfood", title: "バリのローカルフード" },
  { category: "theme_temple", title: "バリの寺院巡り" },
  { category: "theme_surf", title: "バリのサーフスポット" },
  { category: "theme_family", title: "親子で楽しめる場所" },
];

function buildPrompt(pastTopics: string[]): string {
  const pastList = pastTopics.length > 0
    ? `\n\n以下は既出テーマです。被らないようにしてください:\n${pastTopics.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `バリ島のローカル情報カルーセル投稿を作成してください。
エリア×ジャンル（例: チャングーのカフェ5選）またはテーマ型（例: ヌサペニダ日帰り）のどちらかを選んでください。

JSON形式:
{
  "category": "cafe_canggu",
  "area": "チャングー",
  "catchCopy": "チャングーで行きたい！",
  "mainTitle": "おしゃれカフェ",
  "countLabel": "5選",
  "spots": [
    {
      "name": "Fine by SATUSATUCOFFEE",
      "area": "Canggu",
      "description": "アートな空間が魅力的なカフェ。豆にこだわった香り高いコーヒーと、フルーツたっぷりのアサイーボウルが楽しめます。開放的なテラスで楽しむヘルシーなランチも人気。",
      "hours": "8:00-16:30",
      "oneLiner": "アートな空間でこだわりコーヒー"
    }
  ]
}

spots は必ず5件。実在するスポット名を使用。descriptionは3-4文（100-150文字）。hoursは営業時間（不明なら空文字）。oneLinerは15文字以内の一言紹介。${pastList}`;
}

function generateCaption(topic: GeneratedTopic, attributions: string[]): string {
  const spotList = topic.spots
    .map((s, i) => `${i + 1}. ${s.name}｜${s.oneLiner}`)
    .join("\n");

  const areaTag = topic.area ? `#${topic.area.replace(/ー/g, "")}` : "";
  const hashtags = `#バリ島 #バリ旅行 #バリ島観光 #バリ島カフェ #バリ島グルメ ${areaTag} #バリ島留学 #バリリンガル #海外旅行 #インドネシア`;

  const attrLine = attributions.length > 0
    ? `\n\n📷 ${attributions.join(" / ")}`
    : "";

  return `${topic.catchCopy}${topic.mainTitle}${topic.countLabel}\n\n${spotList}\n\n保存してバリ旅行の参考にしてね！\n友達にもシェアしてね\n\n${hashtags}${attrLine}`;
}

export async function generateBaliContent(
  anthropicKey: string,
  unsplashKey: string,
  db: D1Database,
): Promise<BaliContentV2> {
  const client = new Anthropic({ apiKey: anthropicKey });

  // 過去のテーマを取得
  const pastRows = await db
    .prepare("SELECT category || ':' || COALESCE(area,'') || ':' || COALESCE(theme,'') as topic FROM posted_topics ORDER BY id DESC LIMIT 30")
    .all<{ topic: string }>();
  const pastTopics = pastRows.results.map((r) => r.topic);

  const prompt = buildPrompt(pastTopics);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude API returned no text content");
  }

  const topic = JSON.parse(textBlock.text) as GeneratedTopic;

  // Unsplashで写真取得
  const searchQuery = topic.area || topic.mainTitle;
  const photos = await searchPhotosForSpots(
    topic.spots.map((s) => ({ name: s.name, area: s.area })),
    searchQuery,
    unsplashKey,
  );

  // フォールバック画像URL（Unsplashで見つからない場合）
  const fallbackUrl = `https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1080&h=1350&fit=crop`;

  const coverData: BaliCoverData = {
    imageUrl: photos.cover?.imageUrl ?? fallbackUrl,
    catchCopy: topic.catchCopy,
    mainTitle: topic.mainTitle,
    countLabel: topic.countLabel,
  };

  const spotsData: BaliSpotData[] = topic.spots.map((spot, i) => ({
    imageUrl: photos.spots[i]?.imageUrl ?? fallbackUrl,
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
  // 重複排除
  const uniqueAttributions = [...new Set(attributions)];

  const caption = generateCaption(topic, uniqueAttributions);

  return {
    category: topic.category,
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

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/src/content-generator-v2.ts
git commit -m "feat(ig-auto-poster): add v2 content generator with Claude + Unsplash"
```

---

### Task 8: V2 Image Generation Pipeline

**Files:**
- Modify: `ig-auto-poster/src/image-generator.ts`
- Modify: `ig-auto-poster/src/templates/index.ts`

- [ ] **Step 1: Add v2 slide builder to templates/index.ts**

Add imports and function at the end of the file:

```typescript
import { buildBaliCoverNode, type BaliCoverData } from "./bali-cover";
import { buildBaliSpotNode, type BaliSpotData } from "./bali-spot";
import { buildBaliSummaryNode, type BaliSummaryData } from "./bali-summary";
import { buildBaliCtaNode } from "./bali-cta";
import type { BaliContentV2 } from "../content-generator-v2";

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

- [ ] **Step 2: Add v2 image generation to image-generator.ts**

Add import and function:

```typescript
import type { BaliContentV2 } from "./content-generator-v2";
import { buildV2Slides } from "./templates/index";

/** V2: バリ情報スライドのSVG文字列を全枚返す */
export async function generateV2SlideSvgs(content: BaliContentV2): Promise<string[]> {
  const nodes = buildV2Slides(content);
  const svgs: string[] = [];
  for (const node of nodes) {
    svgs.push(await renderNodeToSvg(node));
  }
  return svgs;
}

/** V2: 1枚だけSVG→PNGに変換 */
export async function generateV2SingleSlidePng(content: BaliContentV2, slideIndex: number): Promise<Uint8Array> {
  const nodes = buildV2Slides(content);
  if (slideIndex >= nodes.length) throw new Error(`Slide index ${slideIndex} out of range (total: ${nodes.length})`);
  const svg = await renderNodeToSvg(nodes[slideIndex]);
  return svgToPng(svg);
}

/** V2: スライド総数 */
export function getV2SlideCount(content: BaliContentV2): number {
  return buildV2Slides(content).length;
}
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add ig-auto-poster/src/image-generator.ts ig-auto-poster/src/templates/index.ts
git commit -m "feat(ig-auto-poster): add v2 image generation pipeline"
```

---

### Task 9: Wire Up V2 in index.ts (Generate + Gallery + Approve)

**Files:**
- Modify: `ig-auto-poster/src/index.ts`

This is the largest task. It wires up the new v2 pipeline and replaces the gallery with a management UI.

- [ ] **Step 1: Add v2 imports to index.ts**

Add at top of file:

```typescript
import { generateBaliContent, type BaliContentV2 } from "./content-generator-v2";
import { generateV2SlideSvgs, generateV2SingleSlidePng, getV2SlideCount } from "./image-generator";
```

- [ ] **Step 2: Add v2 generate handler**

Add after `handleGenerateCron`:

```typescript
async function handleGenerateV2(env: Env): Promise<void> {
  const content = await generateBaliContent(
    env.ANTHROPIC_API_KEY,
    env.UNSPLASH_ACCESS_KEY,
    env.DB,
  );

  // DBに保存
  await env.DB
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status) VALUES (?, ?, ?, 'pending_review')")
    .bind(content.category, JSON.stringify(content), content.caption)
    .run();

  // posted_topicsに記録
  await env.DB
    .prepare("INSERT INTO posted_topics (category, area, spots_json) VALUES (?, ?, ?)")
    .bind(content.category, content.area, JSON.stringify(content.spotsData.map((s) => s.spotName)))
    .run();

  console.log(`V2 content generated: ${content.title}`);
}
```

- [ ] **Step 3: Add v2 post handler**

Add after `handleGenerateV2`:

```typescript
async function handlePostV2(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption FROM generated_content WHERE status = 'approved' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string }>();

  if (!row) {
    console.log("No approved v2 content.");
    return;
  }

  const content = JSON.parse(row.content_json) as BaliContentV2;
  const timestamp = Date.now();
  const total = getV2SlideCount(content);
  const imageUrls: string[] = [];

  for (let i = 0; i < total; i++) {
    const png = await generateV2SingleSlidePng(content, i);
    const key = `post/${timestamp}/slide-${i + 1}.png`;
    await env.IMAGES.put(key, png, {
      httpMetadata: { contentType: "image/png" },
    });
    imageUrls.push(`${env.R2_PUBLIC_URL}/${key}`);
  }

  await publishCarousel(imageUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  await sendNotification(
    `投稿完了: ${content.title}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`V2 posted: ${content.title}`);
}
```

- [ ] **Step 4: Update scheduled handler to use v2**

Replace the `scheduled` handler body:

```typescript
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const hour = new Date(controller.scheduledTime).getUTCHours();

    if (hour === 0 || hour === 8) {
      // 08:00/16:00 バリ時間: コンテンツ生成
      await handleGenerateV2(env);
    } else if (hour === 1 || hour === 10) {
      // 09:00/18:00 バリ時間: 承認済み投稿
      await handlePostV2(env);
    }
  },
```

- [ ] **Step 5: Replace gallery routes with management UI**

Replace the existing `/gallery` and `/gallery/:id` routes with:

```typescript
      // V2 ギャラリー: 生成済みコンテンツ管理
      if (request.method === "GET" && url.pathname === "/gallery") {
        const filter = url.searchParams.get("status") || "all";
        const whereClause = filter === "all" ? "" : `WHERE status = '${filter}'`;
        const rows = await env.DB
          .prepare(`SELECT id, template_type, caption, status, created_at FROM generated_content ${whereClause} ORDER BY id DESC LIMIT 50`)
          .all<{ id: number; template_type: string; caption: string; status: string; created_at: string }>();

        const items = rows.results.map((r) => {
          const title = r.caption.split("\n")[0];
          const statusColors: Record<string, string> = {
            pending_review: "#F39C12",
            approved: "#27AE60",
            posted: "#3498DB",
            skipped: "#95A5A6",
            rejected: "#E74C3C",
          };
          const color = statusColors[r.status] || "#888";
          return `<a href="/gallery/${r.id}" class="row">
            <span class="id">#${r.id}</span>
            <span class="status" style="color:${color}">${r.status}</span>
            <span class="title">${title}</span>
            <span class="date">${r.created_at.slice(0, 10)}</span>
          </a>`;
        }).join("");

        const filters = ["all", "pending_review", "approved", "posted", "skipped"].map((s) =>
          `<a href="/gallery?status=${s}" class="filter ${filter === s ? "active" : ""}">${s}</a>`
        ).join("");

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IG Auto Poster - 管理</title><style>
body{background:#111;color:#fff;font-family:sans-serif;margin:0;padding:16px}
h1{text-align:center;font-size:1.4em}
.filters{display:flex;justify-content:center;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.filter{padding:6px 14px;border-radius:20px;background:#222;color:#aaa;text-decoration:none;font-size:13px}
.filter.active{background:#E67E22;color:#fff}
.list{max-width:700px;margin:0 auto}
.row{display:flex;gap:12px;padding:10px 14px;background:#222;border-radius:6px;margin-bottom:6px;text-decoration:none;color:#fff;align-items:center}
.row:hover{background:#333}
.id{color:#888;min-width:35px;font-size:13px}
.status{min-width:100px;font-size:12px;font-weight:bold}
.title{font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.date{color:#888;font-size:12px}
.gen-btn{display:block;margin:20px auto;padding:12px 32px;background:#E67E22;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer}
</style></head><body>
<h1>IG Auto Poster</h1>
<div class="filters">${filters}</div>
<div class="list">${items || '<p style="text-align:center;color:#888">まだコンテンツがありません</p>'}</div>
<form method="POST" action="/generate-v2"><button type="submit" class="gen-btn">新規生成</button></form>
</body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
      }

      // V2 個別コンテンツ表示 + 承認/スキップ
      if (request.method === "GET" && url.pathname.match(/^\/gallery\/(\d+)$/)) {
        const contentId = parseInt(url.pathname.split("/")[2], 10);
        const row = await env.DB
          .prepare("SELECT id, content_json, caption, status, created_at FROM generated_content WHERE id = ?")
          .bind(contentId)
          .first<{ id: number; content_json: string; caption: string; status: string; created_at: string }>();

        if (!row) return json({ error: "Not found" }, 404);

        const content = JSON.parse(row.content_json) as BaliContentV2;
        let slidesHtml = "";

        if (content.coverData) {
          // V2 content: SVGプレビュー生成
          const svgs = await generateV2SlideSvgs(content);
          slidesHtml = svgs.map((svg, i) => `
            <div class="slide">
              <div class="slide-num">${i + 1} / ${svgs.length}</div>
              <div class="svg-wrap">${svg}</div>
            </div>`).join("");
        } else {
          // V1 fallback
          slidesHtml = "<p>V1コンテンツ（プレビュー非対応）</p>";
        }

        const actionBtns = row.status === "pending_review" ? `
          <div class="actions">
            <form method="POST" action="/gallery/${row.id}/approve" style="display:inline"><button class="btn approve">承認</button></form>
            <form method="POST" action="/gallery/${row.id}/skip" style="display:inline"><button class="btn skip">スキップ</button></form>
          </div>` : `<div class="actions"><span class="status-label">${row.status}</span></div>`;

        const title = row.caption.split("\n")[0];
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>#${row.id} ${title}</title><style>
body{background:#111;color:#fff;font-family:sans-serif;margin:0;padding:16px}
h1{text-align:center;font-size:1.2em;margin-bottom:4px}
.nav{text-align:center;margin-bottom:16px}
.nav a{color:#00BCD4;text-decoration:none;font-size:14px}
.slides{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:1200px;margin:0 auto}
.slide{background:#222;border-radius:8px;overflow:hidden;width:270px}
.slide-num{text-align:center;padding:4px;font-size:11px;color:#888;background:#1a1a1a}
.svg-wrap svg{width:100%;height:auto;display:block}
.caption{max-width:600px;margin:24px auto;background:#222;border-radius:8px;padding:16px;font-size:13px;white-space:pre-wrap;line-height:1.6}
.actions{text-align:center;margin:24px 0}
.btn{padding:12px 32px;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin:0 8px}
.approve{background:#27AE60;color:#fff}
.skip{background:#95A5A6;color:#fff}
.status-label{font-size:16px;color:#888;font-weight:bold}
</style></head><body>
<div class="nav"><a href="/gallery">&larr; 一覧に戻る</a></div>
<h1>#${row.id} ${title}</h1>
${actionBtns}
<div class="slides">${slidesHtml}</div>
<div class="caption">${row.caption}</div>
</body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
      }

      // 承認/スキップ POST
      if (request.method === "POST" && url.pathname.match(/^\/gallery\/(\d+)\/(approve|skip)$/)) {
        const parts = url.pathname.split("/");
        const contentId = parseInt(parts[2], 10);
        const action = parts[3];
        const newStatus = action === "approve" ? "approved" : "skipped";
        await env.DB
          .prepare("UPDATE generated_content SET status = ? WHERE id = ?")
          .bind(newStatus, contentId)
          .run();
        return Response.redirect(`${url.origin}/gallery/${contentId}`, 303);
      }

      // V2 生成トリガー
      if (request.method === "POST" && url.pathname === "/generate-v2") {
        await handleGenerateV2(env);
        return Response.redirect(`${url.origin}/gallery`, 303);
      }
```

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Deploy and test**

Run: `npx wrangler deploy`
Expected: Deploy success

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/gallery`
Expected: HTML response with management UI

- [ ] **Step 8: Commit**

```bash
git add ig-auto-poster/src/index.ts
git commit -m "feat(ig-auto-poster): wire up v2 pipeline with gallery management UI"
```

---

### Task 10: Set Secrets and End-to-End Test

**Files:** None (configuration + testing only)

- [ ] **Step 1: Set ANTHROPIC_API_KEY**

User must provide the key. Then:
Run: `echo '<KEY>' | npx wrangler secret put ANTHROPIC_API_KEY --name ig-auto-poster`

- [ ] **Step 2: Set UNSPLASH_ACCESS_KEY**

User must register at https://unsplash.com/developers and create an app. Then:
Run: `echo '<KEY>' | npx wrangler secret put UNSPLASH_ACCESS_KEY --name ig-auto-poster`

- [ ] **Step 3: Trigger v2 content generation**

Run: `curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/generate-v2`
Expected: Redirect to `/gallery` (HTTP 303)

- [ ] **Step 4: Verify in gallery**

Open: `https://ig-auto-poster.archbridge24.workers.dev/gallery`
Expected: New content with status "pending_review"

- [ ] **Step 5: Preview slides**

Click the new content. Expected: 8 slides (1 cover + 5 spots + 1 summary + 1 CTA) with Bali photo backgrounds.

- [ ] **Step 6: Approve and verify**

Click "承認" button. Expected: Status changes to "approved".

- [ ] **Step 7: Commit final state**

```bash
git add -A
git commit -m "feat(ig-auto-poster): v2 complete - bali info carousel auto-poster"
```
