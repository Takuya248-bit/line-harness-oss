# IG自動投稿v3: リール対応+PDCA自動化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instagram投稿（カルーセル+リール）を自動生成・投稿し、Insights→分析→コンテンツ戦略調整のPDCAを自動で回してLINE登録を増やす

**Architecture:** Notion(知識DB+コンテンツ管理) → Worker(生成+投稿+PDCA) → GitHub Actions(画像+動画生成) → Instagram Graph API。コンテンツ形式はカルーセル(教育・保存向け)とリール(新規リーチ向け)の2軸。全投稿CTAをLINE登録に統一。

**Tech Stack:** Cloudflare Workers + D1, GitHub Actions + sharp + ffmpeg, Instagram Graph API v19.0, Notion API

---

## 前提: リサーチ結論

- Watch Time最重要。冒頭1.7秒で離脱判断
- リール最適長: 15-30秒（教育系60-90秒もOK）
- カルーセルはエンゲージメント率10%、リール6-7%。ただし新規リーチはリールが上
- トレンド音源使用で+42%エンゲージメント
- LINE誘導はバリ留学業界で未開拓（先行者優位）
- 静止画スライドショー型リールも教育系で有効

## 前提: 既存システムの問題

- V2テンプレートが3種のみ（旧11種から劣化）→ バリエーション不足
- キャプションが静的フォーマット → テンプレ感
- CTAが「フォローで最新情報をGET」→ LINE登録ではない
- PDCAはカテゴリ重み調整のみ → フォーマット最適化なし
- 知識DBがD1完結 → Notion統合決定済みだが未反映
- リール未対応

## 前提: 決定済み事項（decisions.md準拠）

- 3ツール分担: Claude Code=設計・判断 / Codex exec=実装 / Codex review=レビュー
- ナレッジDBはNotion移行（DB ID: 3347301d-e145-8153-911b-ca1a16c2aa0c）
- コンテンツ管理もNotionで一覧・編集可能にする
- dev-loop: normal（実装+レビュー）で回す

---

## File Structure

### 新規作成
- `ig-auto-poster/src/notion-client.ts` - Notion API読み書き（知識DB+コンテンツ管理）
- `ig-auto-poster/src/content-generator-v3.ts` - 多フォーマット対応コンテンツ生成器
- `ig-auto-poster/src/reel-publisher.ts` - Instagram Reels投稿（Graph API）
- `ig-auto-poster/src/pdca-engine.ts` - 拡張PDCA（フォーマット+カテゴリ最適化）
- `ig-auto-poster/src/caption-generator.ts` - フック+CTA付きキャプション生成
- `ig-auto-poster/scripts/generate-reel.mjs` - ffmpegでスライドショー動画生成
- `ig-auto-poster/migrations/0007_v3_reels_pdca.sql` - DB拡張
- `ig-auto-poster/scripts/bgm/` - リール用BGMファイル格納

### 変更
- `ig-auto-poster/src/index.ts` - v3生成+リール投稿Cron追加
- `ig-auto-poster/src/instagram.ts` - Reels投稿関数追加
- `ig-auto-poster/src/templates/bali-cta.ts` - CTA文言をLINE登録に変更
- `ig-auto-poster/scripts/generate-images.mjs` - リール用スライド生成追加
- `ig-auto-poster/wrangler.toml` - Cron追加、Notion API key追加
- `ig-auto-poster/.github/workflows/generate-ig-images.yml` - ffmpegインストール+リール動画生成追加

---

## Task 1: DBマイグレーション + CTA修正

**出自:** 全投稿CTAをLINE登録に統一（リサーチ結論）+ リール対応のDB拡張
**Done when:** マイグレーションSQL実行でエラーなし。CTAスライドがLINE登録文言に変更済み
**Verified by:** `wrangler d1 migrations apply ig-auto-poster-db --local` 成功。bali-cta.tsのテキストが「LINEで留学費用表をGET」に変更済み
**Approach:** マイグレーションファイル作成 → CTAテンプレート文言変更

**Files:**
- Create: `ig-auto-poster/migrations/0007_v3_reels_pdca.sql`
- Modify: `ig-auto-poster/src/templates/bali-cta.ts`
- Modify: `ig-auto-poster/scripts/generate-images.mjs` (CTA生成部分の文言)

- [ ] **Step 1: マイグレーションSQL作成**

```sql
-- generated_contentにformat_type追加（carousel/reel）
ALTER TABLE generated_content ADD COLUMN format_type TEXT DEFAULT 'carousel';

-- post_performanceにformat_type + shares追加
ALTER TABLE post_performance ADD COLUMN format_type TEXT DEFAULT 'carousel';
ALTER TABLE post_performance ADD COLUMN shares INTEGER DEFAULT 0;

-- フォーマット別重み（carousel vs reel の配分）
CREATE TABLE IF NOT EXISTS format_weights (
  format_type TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.5,
  avg_engagement REAL DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO format_weights (format_type, weight) VALUES
  ('carousel', 0.6),
  ('reel', 0.4);

-- コンテンツテンプレートタイプ（5選以外のフォーマット）
CREATE TABLE IF NOT EXISTS content_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  format_type TEXT NOT NULL DEFAULT 'carousel',
  weight REAL NOT NULL DEFAULT 0.1,
  description TEXT,
  enabled INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO content_templates (name, format_type, weight, description) VALUES
  ('spot_list', 'carousel', 0.20, 'エリア別○選（既存V2）'),
  ('quiz', 'carousel', 0.15, 'クイズ形式（Q→A→解説）'),
  ('before_after', 'carousel', 0.15, '留学ビフォーアフター'),
  ('cost_compare', 'carousel', 0.15, '費用比較（フィリピン vs バリ等）'),
  ('student_voice', 'carousel', 0.10, '卒業生の声'),
  ('hook_facts', 'reel', 0.30, 'フック→事実→CTA（15-30秒）'),
  ('day_in_life', 'reel', 0.20, '留学生の1日（30-60秒）'),
  ('quick_tips', 'reel', 0.25, 'バリ生活Tips（15秒）');
```

- [ ] **Step 2: bali-cta.ts のCTA文言をLINE登録に変更**

変更箇所:
- "保存してバリ旅行の参考にしてね！" → "無料で留学費用表をGET"
- "フォローで最新情報をGET" → "LINEで受け取る"
- "バリ島のおすすめスポットを毎日配信中！" → "プロフィールのリンクからどうぞ"

- [ ] **Step 3: generate-images.mjs のCTA生成部分も同じ文言に変更**

generateCta()関数の文言を同期:
- mainText: "無料で留学費用表をGET"
- buttonText: "LINEで受け取る"
- subText: "プロフィールのリンクからどうぞ"

- [ ] **Step 4: ローカルでマイグレーション実行テスト**

Run: `cd ig-auto-poster && wrangler d1 migrations apply ig-auto-poster-db --local`
Expected: 成功

- [ ] **Step 5: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 6: コミット**

```bash
git add ig-auto-poster/migrations/0007_v3_reels_pdca.sql ig-auto-poster/src/templates/bali-cta.ts ig-auto-poster/scripts/generate-images.mjs
git commit -m "feat(ig): v3 DB migration + CTA to LINE registration"
```

---

## Task 2: Notion連携クライアント

**出自:** ナレッジDB Notion移行決定（3/31 decisions）
**Done when:** Notion知識DBからエントリ取得+コンテンツステータス更新ができる
**Verified by:** `npx tsc --noEmit` パス。手動テスト: `/api/knowledge?source=notion` で Notionエントリ返却
**Approach:** Notion API直接呼び出し（SDK不使用、Workers互換のためfetchベース）

**Files:**
- Create: `ig-auto-poster/src/notion-client.ts`
- Modify: `ig-auto-poster/src/index.ts` (Env に NOTION_API_KEY, NOTION_KNOWLEDGE_DB_ID 追加)
- Modify: `ig-auto-poster/wrangler.toml` (secrets コメント追加)

- [ ] **Step 1: notion-client.ts 作成**

```typescript
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionKnowledgeEntry {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  reliability: string;
}

interface NotionContentItem {
  id: string;
  title: string;
  format_type: "carousel" | "reel";
  template_name: string;
  category: string;
  status: string;
  caption: string;
  content_json: string;
}

async function notionFetch(
  path: string,
  apiKey: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API ${res.status}: ${err}`);
  }
  return res.json();
}

/** 知識DBからカテゴリ+タグでフィルタ取得 */
export async function fetchKnowledgeFromNotion(
  apiKey: string,
  dbId: string,
  categories: string[],
  tags: string[],
  limit = 10,
): Promise<NotionKnowledgeEntry[]> {
  const filters: unknown[] = [];
  if (categories.length > 0) {
    filters.push({
      or: categories.map(c => ({
        property: "category",
        select: { equals: c },
      })),
    });
  }
  if (tags.length > 0) {
    filters.push({
      or: tags.map(t => ({
        property: "tags",
        multi_select: { contains: t },
      })),
    });
  }

  const body = {
    filter: filters.length > 1 ? { and: filters } : filters[0] ?? undefined,
    page_size: limit,
    sorts: [{ property: "use_count", direction: "ascending" }],
  };

  const data = await notionFetch(
    `/databases/${dbId}/query`,
    apiKey,
    "POST",
    body,
  ) as { results: Array<{ id: string; properties: Record<string, unknown> }> };

  return data.results.map(page => ({
    id: page.id,
    category: extractSelect(page.properties.category),
    subcategory: extractSelect(page.properties.subcategory),
    title: extractTitle(page.properties.title),
    content: extractRichText(page.properties.content),
    tags: extractMultiSelect(page.properties.tags),
    source: extractSelect(page.properties.source),
    reliability: extractSelect(page.properties.reliability),
  }));
}

/** use_countをインクリメント */
export async function incrementNotionUseCount(
  apiKey: string,
  pageIds: string[],
): Promise<void> {
  for (const id of pageIds) {
    const page = await notionFetch(`/pages/${id}`, apiKey) as {
      properties: Record<string, unknown>;
    };
    const current = extractNumber(page.properties.use_count);
    await notionFetch(`/pages/${id}`, apiKey, "PATCH", {
      properties: { use_count: { number: current + 1 } },
    });
  }
}

// --- Notion property extractors ---
function extractSelect(prop: unknown): string {
  const p = prop as { select?: { name: string } } | undefined;
  return p?.select?.name ?? "";
}
function extractMultiSelect(prop: unknown): string[] {
  const p = prop as { multi_select?: Array<{ name: string }> } | undefined;
  return p?.multi_select?.map(s => s.name) ?? [];
}
function extractTitle(prop: unknown): string {
  const p = prop as { title?: Array<{ plain_text: string }> } | undefined;
  return p?.title?.map(t => t.plain_text).join("") ?? "";
}
function extractRichText(prop: unknown): string {
  const p = prop as { rich_text?: Array<{ plain_text: string }> } | undefined;
  return p?.rich_text?.map(t => t.plain_text).join("") ?? "";
}
function extractNumber(prop: unknown): number {
  const p = prop as { number?: number } | undefined;
  return p?.number ?? 0;
}
```

- [ ] **Step 2: index.ts の Env に Notion secrets 追加**

```typescript
// Env interface に追加:
NOTION_API_KEY: string;
NOTION_KNOWLEDGE_DB_ID: string;
```

- [ ] **Step 3: wrangler.toml にコメント追加**

```toml
# - NOTION_API_KEY
# - NOTION_KNOWLEDGE_DB_ID
```

- [ ] **Step 4: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/notion-client.ts ig-auto-poster/src/index.ts ig-auto-poster/wrangler.toml
git commit -m "feat(ig): Notion API client for knowledge DB integration"
```

---

## Task 3: 多フォーマットコンテンツ生成器

**出自:** テンプレート3種のみ→多様化（コード分析結果）
**Done when:** carousel 5種 + reel 3種のコンテンツJSONを生成できる。テンプレート重み+カテゴリ重みの2軸で選択される
**Verified by:** `npx tsc --noEmit` パス。`POST /generate` で format_type と template_name がDBに記録される
**Approach:** content-generator-v2.tsを残しつつv3を新規作成。テンプレート選択→Notion知識DB取得→コンテンツJSON生成

**Files:**
- Create: `ig-auto-poster/src/content-generator-v3.ts`
- Create: `ig-auto-poster/src/caption-generator.ts`

- [ ] **Step 1: caption-generator.ts 作成**

リサーチ結論に基づくキャプション生成:
- 冒頭: フック（問いかけ or 驚きの事実）
- 本文: コンテンツ要約
- CTA: LINE登録誘導（統一文言）
- ハッシュタグ: カテゴリ別+共通

```typescript
interface CaptionInput {
  category: string;
  templateName: string;
  title: string;
  hook: string;
  bodyLines: string[];
  area?: string;
}

const HOOKS: Record<string, string[]> = {
  cafe: [
    "バリ島のカフェ、実はコーヒー1杯150円って知ってた？",
    "このカフェ、日本人ほぼゼロです",
    "バリ島住んでる私が通うカフェを本気で厳選しました",
  ],
  cost: [
    "バリ島留学、1ヶ月の生活費いくらだと思う？",
    "フィリピン留学より安いって本当？数字で比較します",
    "家賃3万円でプール付き。バリの物価のリアル",
  ],
  lifestyle: [
    "30代で海外留学、遅い？バリなら全然アリな理由",
    "英語初心者の私がバリ島で3ヶ月過ごした結果",
    "バリ島移住のリアル。キラキラだけじゃない話もします",
  ],
  spot: [
    "ガイドブックに載ってないバリ島の穴場、教えます",
    "バリ島リピーターが行く場所、観光客が行く場所",
  ],
  food: [
    "バリ島の屋台めし、1食100円で満腹になります",
    "現地在住者のガチおすすめローカル飯",
  ],
  beach: [
    "バリ島のビーチ、実はエリアで全然違います",
  ],
  visa: [
    "バリ島のビザ、2026年の最新情報まとめました",
  ],
  culture: [
    "バリ島の文化、知らないと恥かくかも？",
  ],
};

const LINE_CTA = "\n\n---\n留学の費用が気になったら\nプロフィールのLINEから無料で費用表を受け取れます";

const COMMON_TAGS = "#バリ島 #バリ島留学 #バリリンガル #海外留学 #英語留学";

const CATEGORY_TAGS: Record<string, string> = {
  cafe: "#バリ島カフェ #バリカフェ巡り",
  cost: "#バリ島物価 #留学費用",
  lifestyle: "#バリ島移住 #海外移住",
  spot: "#バリ島観光 #バリ島旅行",
  food: "#バリ島グルメ #バリ島ごはん",
  beach: "#バリ島ビーチ",
  visa: "#バリ島ビザ #ビザ情報",
  culture: "#バリ島文化 #バリヒンドゥー",
};

export function generateCaption(input: CaptionInput): string {
  const hooks = HOOKS[input.category] ?? HOOKS.spot!;
  const hook = input.hook || hooks[Math.floor(Math.random() * hooks.length)];

  const body = input.bodyLines.join("\n");
  const catTags = CATEGORY_TAGS[input.category] ?? "";
  const areaTags = input.area ? `#${input.area.replace(/ー/g, "")}` : "";

  return `${hook}\n\n${body}${LINE_CTA}\n\n${COMMON_TAGS} ${catTags} ${areaTags}`.trim();
}
```

- [ ] **Step 2: content-generator-v3.ts 作成**

テンプレート選択（2軸: format_type重み × template重み） → 知識DB取得（Notion優先、D1フォールバック） → コンテンツJSON生成

```typescript
import { fetchKnowledgeFromNotion, incrementNotionUseCount } from "./notion-client";
import { fetchKnowledge, incrementUseCount } from "./knowledge";
import { generateCaption } from "./caption-generator";
import { searchPhotosForSpots } from "./photo-search";

interface GenerateOptions {
  db: D1Database;
  notionApiKey: string;
  notionDbId: string;
  unsplashKey: string;
  serperKey: string;
}

interface GeneratedContent {
  format_type: "carousel" | "reel";
  template_name: string;
  category: string;
  area: string;
  title: string;
  caption: string;
  content_json: string; // テンプレート固有データのJSON
}

// カテゴリ-知識DBマッピング（v2から継承）
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

const AREAS = ["チャングー", "ウブド", "スミニャック", "サヌール", "ヌサドゥア", "クタ", "ジンバラン", "ウルワツ"];

/** フォーマットタイプ選択（format_weights テーブルから重み付きランダム） */
async function selectFormatType(db: D1Database): Promise<"carousel" | "reel"> {
  const rows = await db
    .prepare("SELECT format_type, weight FROM format_weights")
    .all<{ format_type: string; weight: number }>();
  const total = rows.results.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const row of rows.results) {
    rand -= row.weight;
    if (rand <= 0) return row.format_type as "carousel" | "reel";
  }
  return "carousel";
}

/** テンプレート選択（content_templates から format_type でフィルタ → 重み付きランダム） */
async function selectTemplate(db: D1Database, formatType: string): Promise<{ name: string; description: string }> {
  const rows = await db
    .prepare("SELECT name, weight, description FROM content_templates WHERE format_type = ? AND enabled = 1")
    .all<{ name: string; weight: number; description: string }>();
  const total = rows.results.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const row of rows.results) {
    rand -= row.weight;
    if (rand <= 0) return { name: row.name, description: row.description };
  }
  return rows.results[0] ?? { name: "spot_list", description: "" };
}

/** カテゴリ選択（v2と同じ category_weights ベース） */
async function selectCategory(db: D1Database): Promise<string> {
  const rows = await db
    .prepare("SELECT category, weight FROM category_weights ORDER BY weight DESC")
    .all<{ category: string; weight: number }>();
  const total = rows.results.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const row of rows.results) {
    rand -= row.weight;
    if (rand <= 0) return row.category;
  }
  return "cafe";
}

/** 知識取得（Notion優先、D1フォールバック） */
async function getKnowledge(
  opts: GenerateOptions,
  categories: string[],
  tags: string[],
  limit: number,
) {
  try {
    if (opts.notionApiKey && opts.notionDbId) {
      const entries = await fetchKnowledgeFromNotion(
        opts.notionApiKey, opts.notionDbId, categories, tags, limit,
      );
      if (entries.length > 0) return { source: "notion" as const, entries };
    }
  } catch (e) {
    console.error("Notion fetch failed, falling back to D1:", e);
  }
  const entries = await fetchKnowledge(opts.db, categories, tags, limit);
  return { source: "d1" as const, entries: entries.map(e => ({ ...e, tags: [] })) };
}

/** メイン生成関数 */
export async function generateContentV3(opts: GenerateOptions): Promise<GeneratedContent> {
  const formatType = await selectFormatType(opts.db);
  const template = await selectTemplate(opts.db, formatType);
  const category = await selectCategory(opts.db);
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  const mapping = CATEGORY_KNOWLEDGE_MAP[category] ?? { categories: ["locale"], tags: [] };

  const { source, entries } = await getKnowledge(opts, mapping.categories, mapping.tags, 10);

  // テンプレート別コンテンツ生成（各テンプレートのビルダーはここで分岐）
  // 詳細な各テンプレートのビルダーはTask 4以降で実装
  const contentData = buildContentData(template.name, category, area, entries);

  const caption = generateCaption({
    category,
    templateName: template.name,
    title: contentData.title,
    hook: "",
    bodyLines: contentData.bodyLines,
    area,
  });

  return {
    format_type: formatType,
    template_name: template.name,
    category,
    area,
    title: contentData.title,
    caption,
    content_json: JSON.stringify(contentData),
  };
}

interface ContentData {
  title: string;
  bodyLines: string[];
  [key: string]: unknown;
}

/** テンプレート別データ構築（Phase 1: spot_list + hook_facts のみ実装、他は段階的追加） */
function buildContentData(
  templateName: string,
  category: string,
  area: string,
  entries: Array<{ title: string; content: string }>,
): ContentData {
  switch (templateName) {
    case "spot_list":
      return buildSpotList(category, area, entries);
    case "hook_facts":
      return buildHookFacts(category, area, entries);
    default:
      return buildSpotList(category, area, entries);
  }
}

function buildSpotList(
  category: string,
  area: string,
  entries: Array<{ title: string; content: string }>,
): ContentData {
  const selected = entries.slice(0, 5);
  const spots = selected.map((e, i) => ({
    number: i + 1,
    name: e.title,
    description: e.content.slice(0, 150),
    oneLiner: e.content.split(/[。！\n]/)[0]?.slice(0, 15) ?? "",
  }));
  return {
    title: `${area}のおすすめ${category === "cafe" ? "カフェ" : "スポット"}5選`,
    bodyLines: spots.map(s => `${s.number}. ${s.name}｜${s.oneLiner}`),
    coverData: { imageUrl: "", catchCopy: `${area}で行きたい！`, mainTitle: `おすすめ${category}`, countLabel: "5選" },
    spotsData: spots,
    summaryData: { title: `${area}のおすすめ5選`, spots },
  };
}

function buildHookFacts(
  category: string,
  area: string,
  entries: Array<{ title: string; content: string }>,
): ContentData {
  const selected = entries.slice(0, 3);
  const facts = selected.map(e => e.content.split(/[。！\n]/)[0] ?? e.title);
  return {
    title: `${area}の${category}、知ってた？`,
    bodyLines: facts,
    hookText: facts[0] ?? "",
    facts,
    duration: 20,
  };
}
```

- [ ] **Step 3: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 4: コミット**

```bash
git add ig-auto-poster/src/content-generator-v3.ts ig-auto-poster/src/caption-generator.ts
git commit -m "feat(ig): v3 multi-format content generator with Notion integration"
```

---

## Task 4: Instagram Reels投稿対応

**出自:** リール未対応（既存システムの問題）
**Done when:** Instagram Graph API でReels動画を投稿できる。R2上のMP4 URLを受け取って公開まで完了する
**Verified by:** `npx tsc --noEmit` パス。instagram.ts に publishReel 関数が存在し、Graph API v19.0のReels投稿フローに準拠
**Approach:** instagram.ts にReels投稿関数を追加

**Files:**
- Modify: `ig-auto-poster/src/instagram.ts`

- [ ] **Step 1: publishReel関数を追加**

Instagram Graph API のReels投稿フロー:
1. POST /{account_id}/media (media_type=REELS, video_url, caption)
2. GET /{container_id}?fields=status_code でアップロード完了待ち
3. POST /{account_id}/media_publish (creation_id=container_id)

```typescript
/** Create a Reels container */
export async function createReelsContainer(
  videoUrl: string,
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const res = await graphPost<MediaResponse>(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    },
  );
  return res.id;
}

/** Wait for Reels container to finish processing */
async function waitForProcessing(
  containerId: string,
  accessToken: string,
  maxRetries = 30,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`,
    );
    const data = (await res.json()) as { status_code: string };
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error("Reels processing failed");
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("Reels processing timeout");
}

/** Full Reels publish flow */
export async function publishReel(
  videoUrl: string,
  caption: string,
  accessToken: string,
  accountId: string,
): Promise<string> {
  const containerId = await createReelsContainer(videoUrl, caption, accessToken, accountId);
  await waitForProcessing(containerId, accessToken);
  return publishMedia(containerId, accessToken, accountId);
}
```

- [ ] **Step 2: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/instagram.ts
git commit -m "feat(ig): add Reels publishing via Graph API"
```

---

## Task 5: リール動画生成スクリプト（GitHub Actions）

**出自:** リール対応の実装部分
**Done when:** pending_imagesのリールコンテンツからMP4動画を生成し、R2にアップロードできる
**Verified by:** `node scripts/generate-reel.mjs --dry-run` でffmpegコマンドが正しく構築される。生成されたMP4が15-30秒で1080x1920
**Approach:** 静止画スライドショー+テキストオーバーレイ+BGMをffmpegで合成

**Files:**
- Create: `ig-auto-poster/scripts/generate-reel.mjs`
- Create: `ig-auto-poster/scripts/bgm/.gitkeep`
- Modify: `ig-auto-poster/.github/workflows/generate-ig-images.yml`

- [ ] **Step 1: generate-reel.mjs 作成**

フロー:
1. Worker APIから pending_images & format_type=reel のコンテンツ取得
2. content_jsonからスライドデータ抽出
3. 各スライドをsharpで1080x1920の画像生成（テキストオーバーレイ付き）
4. ffmpegで画像→動画変換（各スライド3-5秒、フェード遷移、BGM重畳）
5. MP4をWorker APIにアップロード

```javascript
import sharp from "sharp";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_URL = process.env.WORKER_URL || "https://ig-auto-poster.archbridge24.workers.dev";
const WIDTH = 1080;
const HEIGHT = 1920; // 9:16 for Reels
const FONT_FAMILY = "Zen Maru Gothic";
const TMP_DIR = "/tmp/ig-reels";

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** フックスライド生成（冒頭2秒、太字テキスト中央配置） */
async function generateHookSlide(hookText) {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const lines = hookText.match(/.{1,12}/g) || [hookText];
  const textSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${lines.map((line, i) =>
      `<text x="${WIDTH / 2}" y="${HEIGHT / 2 - (lines.length - 1) * 40 + i * 80}"
        font-family="${FONT_FAMILY}" font-size="64" font-weight="900" fill="white"
        text-anchor="middle">${escapeXml(line)}</text>`
    ).join("\n")}
  </svg>`);

  return sharp(bgSvg)
    .composite([{ input: textSvg, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** ファクトスライド生成（事実テキスト+背景画像） */
async function generateFactSlide(text, imageUrl) {
  // prepareBackground と同様のロジック（generate-images.mjsから流用）
  let bg;
  if (imageUrl) {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const overlay = Buffer.from(
        `<svg width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(0,0,0,0.5)"/></svg>`
      );
      bg = await sharp(buf).resize(WIDTH, HEIGHT, { fit: "cover" }).composite([{ input: overlay }]).jpeg().toBuffer();
    }
  }
  if (!bg) {
    bg = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 77, b: 64, alpha: 1 } } }).jpeg().toBuffer();
  }

  const lines = text.match(/.{1,14}/g) || [text];
  const textSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    ${lines.map((line, i) =>
      `<text x="${WIDTH / 2}" y="${HEIGHT / 2 - (lines.length - 1) * 35 + i * 70}"
        font-family="${FONT_FAMILY}" font-size="48" font-weight="900" fill="white"
        text-anchor="middle" filter="url(#shadow)">${escapeXml(line)}</text>`
    ).join("\n")}
  </svg>`);

  return sharp(bg).composite([{ input: textSvg }]).jpeg({ quality: 90 }).toBuffer();
}

/** CTAスライド生成 */
async function generateCtaSlide() {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <rect x="${WIDTH/2-280}" y="${HEIGHT/2+50}" width="560" height="80" rx="40" fill="#06C755"/>
    <text x="${WIDTH/2}" y="${HEIGHT/2+102}" font-family="${FONT_FAMILY}" font-size="36" font-weight="900" fill="white" text-anchor="middle">LINEで費用表を受け取る</text>
    <text x="${WIDTH/2}" y="${HEIGHT/2-40}" font-family="${FONT_FAMILY}" font-size="48" font-weight="900" fill="white" text-anchor="middle">気になったら</text>
    <text x="${WIDTH/2}" y="${HEIGHT/2+10}" font-family="${FONT_FAMILY}" font-size="48" font-weight="900" fill="white" text-anchor="middle">プロフィールのリンクから</text>
    <text x="${WIDTH/2}" y="${HEIGHT/2+200}" font-family="${FONT_FAMILY}" font-size="30" font-weight="700" fill="rgba(255,255,255,0.7)" text-anchor="middle">Barilingual</text>
  </svg>`);
  return sharp(bgSvg).jpeg({ quality: 90 }).toBuffer();
}

/** ffmpegでスライドショー動画生成 */
function createVideo(slidePaths, outputPath, durationPerSlide = 4) {
  // concat demuxer用のファイルリスト作成
  const listPath = path.join(TMP_DIR, "slides.txt");
  const lines = slidePaths.map(p => `file '${p}'\nduration ${durationPerSlide}`);
  lines.push(`file '${slidePaths[slidePaths.length - 1]}'`); // 最後のスライド用
  fs.writeFileSync(listPath, lines.join("\n"));

  // BGMファイル（存在すれば使用）
  const bgmDir = path.join(__dirname, "bgm");
  const bgmFiles = fs.existsSync(bgmDir) ? fs.readdirSync(bgmDir).filter(f => f.endsWith(".mp3") || f.endsWith(".m4a")) : [];
  const bgmPath = bgmFiles.length > 0 ? path.join(bgmDir, bgmFiles[Math.floor(Math.random() * bgmFiles.length)]) : null;

  const totalDuration = slidePaths.length * durationPerSlide;

  let cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -vf "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:-1:-1,fps=30"`;

  if (bgmPath) {
    cmd += ` -i "${bgmPath}" -c:a aac -b:a 128k -shortest`;
  }

  cmd += ` -c:v libx264 -pix_fmt yuv420p -t ${totalDuration} "${outputPath}"`;

  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const res = await fetch(`${WORKER_URL}/api/pending-images`);
  const data = await res.json();
  const reelItems = (data.items || []).filter(item => {
    const json = JSON.parse(item.content_json);
    return json.duration !== undefined; // リールはdurationを持つ
  });

  if (reelItems.length === 0) {
    console.log("[generate-reel] No pending reels.");
    return;
  }

  for (const item of reelItems) {
    console.log(`[generate-reel] Processing #${item.id}`);
    try {
      const content = JSON.parse(item.content_json);
      const slidePaths = [];

      // 1. フックスライド
      const hookBuf = await generateHookSlide(content.hookText || content.title);
      const hookPath = path.join(TMP_DIR, `${item.id}-hook.jpg`);
      fs.writeFileSync(hookPath, hookBuf);
      slidePaths.push(hookPath);

      // 2. ファクトスライド
      for (let i = 0; i < (content.facts || []).length; i++) {
        const factBuf = await generateFactSlide(content.facts[i], null);
        const factPath = path.join(TMP_DIR, `${item.id}-fact-${i}.jpg`);
        fs.writeFileSync(factPath, factBuf);
        slidePaths.push(factPath);
      }

      // 3. CTAスライド
      const ctaBuf = await generateCtaSlide();
      const ctaPath = path.join(TMP_DIR, `${item.id}-cta.jpg`);
      fs.writeFileSync(ctaPath, ctaBuf);
      slidePaths.push(ctaPath);

      // 4. ffmpegで動画生成
      const durationPerSlide = Math.max(3, Math.floor((content.duration || 20) / slidePaths.length));
      const videoPath = path.join(TMP_DIR, `${item.id}.mp4`);
      createVideo(slidePaths, videoPath, durationPerSlide);

      // 5. Worker APIにアップロード
      const videoBuffer = fs.readFileSync(videoPath);
      const uploadRes = await fetch(`${WORKER_URL}/api/slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: item.id,
          slides: [{ index: 0, imageBase64: videoBuffer.toString("base64") }],
          isVideo: true,
        }),
      });

      if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
      console.log(`[generate-reel] Done #${item.id}`);
    } catch (err) {
      console.error(`[generate-reel] Error #${item.id}:`, err.message);
    }
  }

  // cleanup
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch(console.error);
```

- [ ] **Step 2: BGMディレクトリ作成**

```bash
mkdir -p ig-auto-poster/scripts/bgm
touch ig-auto-poster/scripts/bgm/.gitkeep
```

注意: BGMファイル（.mp3/.m4a）は著作権フリーのものを手動配置。NCS等から取得。

- [ ] **Step 3: GitHub Actions workflow にffmpegとリール生成追加**

generate-ig-images.yml に追加:
- ffmpegインストールステップ
- `node scripts/generate-reel.mjs` 実行ステップ

- [ ] **Step 4: コミット**

```bash
git add ig-auto-poster/scripts/generate-reel.mjs ig-auto-poster/scripts/bgm/.gitkeep ig-auto-poster/.github/workflows/generate-ig-images.yml
git commit -m "feat(ig): Reels video generation with ffmpeg slideshow"
```

---

## Task 6: PDCA自動化エンジン

**出自:** PDCAの「改善実行」部分が欠落（コード分析結果）
**Done when:** 週次Cronでフォーマット別+カテゴリ別のエンゲージメントスコアを計算し、format_weights + category_weights + content_templates の重みを自動調整する
**Verified by:** `npx tsc --noEmit` パス。`POST /collect-insights` でformat_weightsとcontent_templatesのweightが更新される
**Approach:** optimizer.tsを拡張し、フォーマット×テンプレート×カテゴリの3軸で最適化

**Files:**
- Create: `ig-auto-poster/src/pdca-engine.ts`
- Modify: `ig-auto-poster/src/insights.ts` (shares取得追加)
- Modify: `ig-auto-poster/src/index.ts` (週次CronでPDCAエンジン呼び出し)

- [ ] **Step 1: insights.ts に shares 取得追加**

fetchMediaInsights の metric に `shares` 追加。
post_performance INSERT に shares カラム追加。

- [ ] **Step 2: pdca-engine.ts 作成**

```typescript
/**
 * エンゲージメントスコア = saves×3 + shares×5 + likes×1
 * saves: 保存=後で見返す意図。LINE登録に近い行動
 * shares: DM転送=新規リーチの最強シグナル
 * likes: 基本指標
 *
 * 最適化対象:
 * 1. format_weights (carousel vs reel)
 * 2. content_templates (テンプレート別重み)
 * 3. category_weights (カテゴリ別重み、既存)
 */

interface EngagementScore {
  key: string;
  avgScore: number;
  totalPosts: number;
  currentWeight: number;
}

/** エンゲージメントスコア計算 */
function calcScore(saves: number, shares: number, likes: number): number {
  return saves * 3 + shares * 5 + likes;
}

/** 重み調整（上位グループ+0.05、下位グループ-0.05、最低0.05、最大0.40） */
function adjustWeights(
  scores: EngagementScore[],
  minPosts: number,
): Map<string, number> {
  const optimizable = scores.filter(s => s.totalPosts >= minPosts);
  const result = new Map<string, number>();

  if (optimizable.length < 2) {
    // データ不足: 現在の重みを維持
    for (const s of scores) result.set(s.key, s.currentWeight);
    return result;
  }

  const sorted = [...optimizable].sort((a, b) => b.avgScore - a.avgScore);
  const topN = Math.max(1, Math.floor(sorted.length * 0.4));
  const bottomN = Math.max(1, Math.floor(sorted.length * 0.3));
  const topSet = new Set(sorted.slice(0, topN).map(s => s.key));
  const bottomSet = new Set(sorted.slice(-bottomN).map(s => s.key));

  for (const s of scores) {
    let w = s.currentWeight;
    if (topSet.has(s.key)) w += 0.05;
    if (bottomSet.has(s.key)) w -= 0.05;
    w = Math.max(0.05, Math.min(0.40, w));
    result.set(s.key, w);
  }

  // 正規化
  const total = [...result.values()].reduce((s, v) => s + v, 0);
  for (const [k, v] of result) {
    result.set(k, Math.round((v / total) * 100) / 100);
  }

  return result;
}

/** フォーマット別最適化 */
export async function optimizeFormatWeights(db: D1Database): Promise<void> {
  const rows = await db.prepare(`
    SELECT fw.format_type, fw.weight,
      COALESCE(AVG(pp.saves * 3 + pp.shares * 5 + pp.likes), 0) as avgScore,
      COUNT(pp.id) as totalPosts
    FROM format_weights fw
    LEFT JOIN post_performance pp ON fw.format_type = pp.format_type
    GROUP BY fw.format_type
  `).all<{ format_type: string; weight: number; avgScore: number; totalPosts: number }>();

  const scores = rows.results.map(r => ({
    key: r.format_type,
    avgScore: r.avgScore,
    totalPosts: r.totalPosts,
    currentWeight: r.weight,
  }));

  const newWeights = adjustWeights(scores, 3);
  for (const [fmt, weight] of newWeights) {
    await db.prepare(
      "UPDATE format_weights SET weight = ?, avg_engagement = ?, total_posts = ?, updated_at = datetime('now') WHERE format_type = ?"
    ).bind(weight, scores.find(s => s.key === fmt)?.avgScore ?? 0, scores.find(s => s.key === fmt)?.totalPosts ?? 0, fmt).run();
  }
}

/** テンプレート別最適化 */
export async function optimizeTemplateWeights(db: D1Database): Promise<void> {
  const rows = await db.prepare(`
    SELECT ct.name, ct.format_type, ct.weight,
      COALESCE(AVG(pp.saves * 3 + pp.shares * 5 + pp.likes), 0) as avgScore,
      COUNT(pp.id) as totalPosts
    FROM content_templates ct
    LEFT JOIN generated_content gc ON ct.name = gc.template_name
    LEFT JOIN post_performance pp ON gc.ig_media_id = pp.ig_media_id
    WHERE ct.enabled = 1
    GROUP BY ct.name
  `).all<{ name: string; format_type: string; weight: number; avgScore: number; totalPosts: number }>();

  const scores = rows.results.map(r => ({
    key: r.name,
    avgScore: r.avgScore,
    totalPosts: r.totalPosts,
    currentWeight: r.weight,
  }));

  const newWeights = adjustWeights(scores, 2);
  for (const [name, weight] of newWeights) {
    await db.prepare("UPDATE content_templates SET weight = ? WHERE name = ?").bind(weight, name).run();
  }
}

/** PDCA週次実行（全3軸） */
export async function runPDCA(db: D1Database): Promise<string> {
  await optimizeFormatWeights(db);
  await optimizeTemplateWeights(db);
  // カテゴリは既存optimizer.tsのoptimizeWeightsをそのまま使う

  // サマリ生成
  const fmtRows = await db.prepare("SELECT format_type, weight, avg_engagement, total_posts FROM format_weights").all();
  const tplRows = await db.prepare("SELECT name, weight FROM content_templates WHERE enabled = 1 ORDER BY weight DESC").all();

  return `PDCA完了\nフォーマット: ${JSON.stringify(fmtRows.results)}\nテンプレートTop3: ${JSON.stringify(tplRows.results.slice(0, 3))}`;
}
```

- [ ] **Step 3: index.ts の週次Cronにpdca-engine呼び出し追加**

handleWeeklyInsightsCron内で:
```typescript
import { runPDCA } from "./pdca-engine";
// 既存のoptimizeWeightsの後に追加
const pdcaSummary = await runPDCA(env.DB);
```

- [ ] **Step 4: tsc --noEmit**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/pdca-engine.ts ig-auto-poster/src/insights.ts ig-auto-poster/src/index.ts
git commit -m "feat(ig): PDCA engine with format + template + category optimization"
```

---

## Task 7: index.ts統合 + Cron追加

**出自:** 全タスクの統合
**Done when:** v3生成+リール投稿+PDCAが全てCronで自動実行される。既存v2フローとの後方互換あり
**Verified by:** `npx tsc --noEmit` パス。wrangler.tomlのCron定義が正しい。`POST /generate` で v3コンテンツが生成される
**Approach:** index.tsのCronハンドラーをv3に切り替え。v2は削除せず共存

**Files:**
- Modify: `ig-auto-poster/src/index.ts`
- Modify: `ig-auto-poster/wrangler.toml`

- [ ] **Step 1: index.ts にv3生成ハンドラー追加**

```typescript
import { generateContentV3 } from "./content-generator-v3";
import { publishReel } from "./instagram"; // 新規追加分
import { runPDCA } from "./pdca-engine";

async function handleV3GenerateCron(env: Env): Promise<void> {
  const content = await generateContentV3({
    db: env.DB,
    notionApiKey: env.NOTION_API_KEY,
    notionDbId: env.NOTION_KNOWLEDGE_DB_ID,
    unsplashKey: env.UNSPLASH_ACCESS_KEY,
    serperKey: env.SERPER_API_KEY,
  });

  await env.DB
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status, category, format_type, template_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind("bali_v3", content.content_json, content.caption, "pending_images", content.category, content.format_type, content.template_name)
    .run();

  await sendNotification(
    `新投稿生成\n形式: ${content.format_type}\nテンプレ: ${content.template_name}\nカテゴリ: ${content.category}\nタイトル: ${content.title}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
}

async function handleV3PostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption, category, format_type FROM generated_content WHERE status = 'approved' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string; category: string; format_type: string }>();

  if (!row) return;
  const stored = JSON.parse(row.content_json);

  let publishedId: string;
  if (row.format_type === "reel" && stored.videoUrl) {
    publishedId = await publishReel(stored.videoUrl, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
  } else if (stored.slideUrls?.length > 0) {
    publishedId = await publishCarousel(stored.slideUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
  } else {
    console.log("Content not ready for posting");
    return;
  }

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now'), ig_media_id = ? WHERE id = ?")
    .bind(publishedId, row.id)
    .run();
}
```

- [ ] **Step 2: scheduled()をv3に切り替え**

既存のhandleV2GenerateCron → handleV3GenerateCron に差し替え
既存のhandleV2PostCron → handleV3PostCron に差し替え

- [ ] **Step 3: generated_contentにtemplate_nameカラム追加（マイグレーションに追記）**

Task 1のマイグレーションに追記:
```sql
ALTER TABLE generated_content ADD COLUMN template_name TEXT DEFAULT NULL;
```

- [ ] **Step 4: tsc --noEmit + deploy dry-run**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラー0

- [ ] **Step 5: コミット**

```bash
git add ig-auto-poster/src/index.ts ig-auto-poster/wrangler.toml ig-auto-poster/migrations/0007_v3_reels_pdca.sql
git commit -m "feat(ig): integrate v3 generator + reels posting into cron pipeline"
```

---

## Task 8: R2動画アップロード対応

**出自:** リール動画をR2に保存してInstagramに渡す必要がある
**Done when:** `/api/slides` エンドポイントがisVideo=trueの場合にMP4としてR2保存し、content_jsonにvideoUrlを設定する
**Verified by:** `npx tsc --noEmit` パス
**Approach:** 既存の /api/slides ハンドラーを拡張

**Files:**
- Modify: `ig-auto-poster/src/index.ts` (/api/slides ハンドラー)

- [ ] **Step 1: /api/slides にMP4対応追加**

```typescript
// 既存のslideアップロード処理内に追加
if (body.isVideo && body.slides.length === 1) {
  const video = body.slides[0];
  const binary = Uint8Array.from(atob(video.imageBase64), c => c.charCodeAt(0));
  const key = `reels/${body.contentId}/${Date.now()}/reel.mp4`;
  await env.IMAGES.put(key, binary, {
    httpMetadata: { contentType: "video/mp4" },
  });
  stored.videoUrl = `${env.R2_PUBLIC_URL}/${key}`;
  // status更新
}
```

- [ ] **Step 2: tsc --noEmit**
- [ ] **Step 3: コミット**

```bash
git add ig-auto-poster/src/index.ts
git commit -m "feat(ig): R2 video upload support for Reels"
```

---

## 実行順序とスコープ

| Phase | Tasks | 効果 |
|-------|-------|------|
| Phase 1 (MVP) | Task 1, 2, 3, 7 | CTA修正+Notion連携+多フォーマット生成 |
| Phase 2 (Reels) | Task 4, 5, 8 | リール動画生成+投稿 |
| Phase 3 (PDCA) | Task 6 | 自動最適化ループ |

Phase 1だけでも「CTA→LINE登録」「コンテンツ多様化」「Notion管理」が実現し、既存の問題の大部分が解決する。

---

## Phase 2以降の拡張候補（今回スコープ外）

- Claude APIによるキャプション高品質化（ANTHROPIC_API_KEY活用）
- UGC統合（卒業生動画のR2ストック→自動組み込み）
- A/Bテスト（同カテゴリで異なるフックを比較）
- Notionダッシュボード（PDCA結果の可視化）
- トレンド音源の自動取得
