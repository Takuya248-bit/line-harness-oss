# IG Auto Poster: Sharp画像生成パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satori+resvg-wasmをWorkerから除去し、GitHub Actions上のSharp (Node.js) で画像を事前生成してR2にアップロードする方式に移行する。Worker側は投稿・ギャラリー・APIのみ担当しCPU問題を完全解消。

**Architecture:** Worker `/generate` でコンテンツメタデータ+写真URLをD1に保存 → GitHub Actionsのcron (30分毎) が `pending_images` ステータスのコンテンツを検出 → Sharp で写真ダウンロード+テキスト合成+JPEG出力 → Worker `/api/slides` にアップロード → Worker が R2保存+ギャラリー表示可能に。

**Tech Stack:** GitHub Actions (Node.js 22), Sharp, node-canvas (テキスト描画), Google Fonts (Zen Maru Gothic), Cloudflare Workers (投稿のみ), R2, D1

---

## File Structure

```
ig-auto-poster/
├── scripts/
│   ├── generate-images.mjs        # Create: Sharp画像生成スクリプト (GH Actionsで実行)
│   └── fonts/
│       └── .gitkeep               # Create: フォントDL先 (gitignore, GH Actionsで毎回DL)
├── src/
│   ├── index.ts                   # Modify: Satori import除去, /api/slides追加, /api/pending-images追加, Post cronからSatori除去
│   ├── image-generator.ts         # Delete: Satori+resvg-wasm完全除去
│   ├── satori-types.ts            # Delete: 不要
│   ├── content-generator-v2.ts    # Modify: status を 'pending_images' で保存するよう変更
│   ├── templates/                 # Keep: 将来参照用に残すが import しない
│   └── (他のファイル)              # No change
├── .github/
│   └── workflows/
│       └── generate-ig-images.yml # Create: 画像生成ワークフロー
└── package.json                   # Modify: satori, @resvg/resvg-wasm 除去, scripts追加
```

---

### Task 1: Worker API - pending-images + slides upload

**Files:**
- Modify: `ig-auto-poster/src/index.ts`

- [ ] **Step 1: Add GET /api/pending-images endpoint**

index.ts の `// --- Manual triggers ---` セクションの前に追加:

```typescript
      // --- Image Pipeline API ---
      if (request.method === "GET" && url.pathname === "/api/pending-images") {
        const rows = await env.DB
          .prepare("SELECT id, content_json, caption, category FROM generated_content WHERE status = 'pending_images' ORDER BY id ASC LIMIT 5")
          .all<{ id: number; content_json: string; caption: string; category: string }>();
        return json({ items: rows.results });
      }
```

- [ ] **Step 2: Add POST /api/slides endpoint**

index.ts の pending-images エンドポイントの後に追加:

```typescript
      if (request.method === "POST" && url.pathname === "/api/slides") {
        const body = await request.json() as {
          contentId: number;
          slides: { index: number; imageBase64: string }[];
        };

        if (!body.contentId || !body.slides?.length) {
          return json({ error: "contentId and slides are required" }, 400);
        }

        const row = await env.DB
          .prepare("SELECT content_json FROM generated_content WHERE id = ?")
          .bind(body.contentId)
          .first<{ content_json: string }>();

        if (!row) return json({ error: "Content not found" }, 404);

        const stored = JSON.parse(row.content_json);
        const slideUrls: string[] = stored.slideUrls ?? [];
        const timestamp = Date.now();

        for (const slide of body.slides) {
          const binary = Uint8Array.from(atob(slide.imageBase64), c => c.charCodeAt(0));
          const key = `slides/${body.contentId}/${timestamp}/slide-${slide.index + 1}.jpg`;
          await env.IMAGES.put(key, binary, {
            httpMetadata: { contentType: "image/jpeg" },
          });
          slideUrls[slide.index] = `${env.R2_PUBLIC_URL}/${key}`;
        }

        stored.slideUrls = slideUrls;

        const autoApprove = await getSetting(env.DB, "auto_approve");
        const newStatus = autoApprove === "true" ? "approved" : "pending_review";

        await env.DB
          .prepare("UPDATE generated_content SET content_json = ?, status = ? WHERE id = ?")
          .bind(JSON.stringify(stored), newStatus, body.contentId)
          .run();

        return json({ success: true, contentId: body.contentId, slideCount: body.slides.length, slideUrls });
      }
```

- [ ] **Step 3: Modify handleV2GenerateCron to use 'pending_images' status**

handleV2GenerateCron 内のステータスを変更:

```typescript
// 変更前:
autoApprove === "true" ? "approved" : "pending_review",
// 変更後:
"pending_images",
```

LINE通知も変更:

```typescript
await sendNotification(
  `新しい投稿を準備中...\nテーマ: ${content.title}\nカテゴリ: ${content.category}\n画像生成後にギャラリーで確認できます`,
  env.LINE_OWNER_USER_ID,
  env.LINE_CHANNEL_ACCESS_TOKEN,
);
```

- [ ] **Step 4: Modify handleV2PostCron to use slideUrls from content_json**

handleV2PostCron 内の画像生成ループを、content_json.slideUrls から取得する方式に変更:

```typescript
async function handleV2PostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption, category FROM generated_content WHERE status = 'approved' AND template_type = 'bali_v2' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string; category: string }>();

  if (!row) {
    console.log("No approved v2 content.");
    return;
  }

  const stored = JSON.parse(row.content_json) as { title: string; slideUrls?: string[] };

  if (!stored.slideUrls || stored.slideUrls.length === 0) {
    console.log("Approved content has no slide images yet. Skipping.");
    return;
  }

  const publishedId = await publishCarousel(stored.slideUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

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
```

- [ ] **Step 5: Remove Satori/resvg imports and related functions**

index.ts のトップから以下のimportを削除:

```typescript
// 削除:
import { generateSlideImages, generateFirstSlideSvg, generateSingleSlidePng, getSlideCount, generateV2SlideImages, generateV2SinglePng, getV2SlideCount } from "./image-generator";
import { getCaption } from "./captions";
import { allContent } from "./content-data";
import type { ContentItem } from "./content-data";
import type { BaliContentV2 } from "./templates/index";
```

以下の関数も削除:
- `generateAndStoreSingleImage`
- `generateAndStoreV2Image`
- v1フォールバックコード（handleV2PostCron内のif (!row)ブロック全体。代わりにreturnのみ）

gallery previewルート (`POST /gallery/:id/preview/:slideIndex`) も削除（Sharpで生成するため不要）。

`getContentIndex`, `updateContentIndex` も v1フォールバック削除に伴い不要なら削除。

- [ ] **Step 6: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: エラーあればimport漏れを修正

- [ ] **Step 7: Commit**

```bash
git add ig-auto-poster/src/index.ts
git commit -m "refactor(ig-auto-poster): remove Satori/resvg, add slides API for Sharp pipeline"
```

---

### Task 2: Remove Satori/resvg dependencies

**Files:**
- Delete: `ig-auto-poster/src/image-generator.ts`
- Delete: `ig-auto-poster/src/satori-types.ts`
- Modify: `ig-auto-poster/package.json`

- [ ] **Step 1: Delete image-generator.ts and satori-types.ts**

```bash
rm ig-auto-poster/src/image-generator.ts ig-auto-poster/src/satori-types.ts
```

- [ ] **Step 2: Remove Satori/resvg from package.json dependencies**

package.json の dependencies から削除:
```json
"@resvg/resvg-wasm": "^2.6.2",
"satori": "^0.26.0"
```

`@anthropic-ai/sdk` も不要（Haikuは使わない）なので削除。

dependencies が空なら `"dependencies": {}` にする。

- [ ] **Step 3: Run pnpm install**

Run: `cd ig-auto-poster && pnpm install`

- [ ] **Step 4: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`
Expected: image-generator.ts を参照するファイルがあればエラー。templates/index.ts の buildV2Slides 等を参照するimportがindex.tsに残っていないか確認。

- [ ] **Step 5: Commit**

```bash
git add ig-auto-poster/src/ ig-auto-poster/package.json ig-auto-poster/pnpm-lock.yaml
git commit -m "refactor(ig-auto-poster): remove satori, resvg-wasm, anthropic-sdk dependencies"
```

---

### Task 3: Sharp画像生成スクリプト

**Files:**
- Create: `ig-auto-poster/scripts/generate-images.mjs`

- [ ] **Step 1: Create generate-images.mjs**

```javascript
import sharp from "sharp";
import { registerFont, createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKER_URL = process.env.WORKER_URL || "https://ig-auto-poster.archbridge24.workers.dev";
const WIDTH = 1080;
const HEIGHT = 1350;
const FONT_FAMILY = "Zen Maru Gothic";

// --- フォント登録 ---
function setupFonts() {
  const fontDir = path.join(__dirname, "fonts");
  const boldPath = path.join(fontDir, "ZenMaruGothic-Black.ttf");
  const mediumPath = path.join(fontDir, "ZenMaruGothic-Bold.ttf");
  if (fs.existsSync(boldPath)) registerFont(boldPath, { family: FONT_FAMILY, weight: "900" });
  if (fs.existsSync(mediumPath)) registerFont(mediumPath, { family: FONT_FAMILY, weight: "700" });
}

// --- 画像ダウンロード ---
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; IGAutoBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// --- 写真を1080x1350にリサイズ+暗めオーバーレイ ---
async function prepareBackground(imageUrl, overlayOpacity = 0.35) {
  let imgBuf = await downloadImage(imageUrl);
  if (!imgBuf) {
    // フォールバック: 黒背景にグラデーション
    return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 20, g: 40, b: 40, alpha: 1 } } }).jpeg().toBuffer();
  }

  const overlay = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(0,0,0,${overlayOpacity})"/></svg>`
  );

  return sharp(imgBuf)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- テキストをSVGで描画（node-canvas で計測、Sharp compositeで合成） ---
function textToSvg(lines, options = {}) {
  const {
    fontSize = 40,
    fontWeight = "700",
    color = "white",
    align = "center",
    x = WIDTH / 2,
    y = 0,
    lineHeight = 1.5,
    maxWidth = WIDTH - 80,
    shadow = true,
  } = options;

  const lineElements = lines.map((line, i) => {
    const yPos = y + i * fontSize * lineHeight;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const shadowFilter = shadow ? `filter="url(#shadow)"` : "";
    return `<text x="${x}" y="${yPos}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${anchor}" ${shadowFilter}>${escapeXml(line)}</text>`;
  });

  const totalHeight = lines.length * fontSize * lineHeight + 20;
  return {
    svg: Buffer.from(`<svg width="${WIDTH}" height="${Math.ceil(totalHeight)}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
      ${lineElements.join("\n")}
    </svg>`),
    height: totalHeight,
  };
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- テキスト折り返し ---
function wrapText(text, maxChars = 18) {
  if (text.length <= maxChars) return [text];
  const lines = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
}

// --- カバースライド生成 ---
async function generateCover(coverData) {
  const bg = await prepareBackground(coverData.imageUrl, 0.45);

  // 中央のテキストボックス（半透明黒背景+白枠）
  const boxWidth = 800;
  const boxHeight = 400;
  const boxX = (WIDTH - boxWidth) / 2;
  const boxY = (HEIGHT - boxHeight) / 2;

  const boxSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="12" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.8)" stroke-width="3"/>
  </svg>`);

  // Balilingualロゴ
  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle" filter="url(#s)">Barilingual</text>
  </svg>`);

  // キャッチコピー
  const catchLines = wrapText(coverData.catchCopy, 18);
  const catchSvg = textToSvg(catchLines, { fontSize: 42, fontWeight: "700", y: boxY + 60 });

  // メインタイトル
  const titleLines = wrapText(coverData.mainTitle, 10);
  const titleSvg = textToSvg(titleLines, { fontSize: 72, fontWeight: "900", y: boxY + 160 });

  // カウントバッジ
  const badgeSize = 80;
  const badgeX = (WIDTH - badgeSize) / 2;
  const badgeY = boxY + boxHeight - badgeSize - 30;
  const badgeSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${badgeX + badgeSize / 2}" cy="${badgeY + badgeSize / 2}" r="${badgeSize / 2}" fill="#E67E22"/>
    <text x="${badgeX + badgeSize / 2}" y="${badgeY + badgeSize / 2 + 12}" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">${escapeXml(coverData.countLabel)}</text>
  </svg>`);

  return sharp(bg)
    .composite([
      { input: boxSvg, top: 0, left: 0 },
      { input: logoSvg, top: 20, left: 0 },
      { input: catchSvg.svg, top: 0, left: 0 },
      { input: titleSvg.svg, top: 0, left: 0 },
      { input: badgeSvg, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- スポットスライド生成 ---
async function generateSpot(spotData) {
  const bg = await prepareBackground(spotData.imageUrl, 0.3);

  // Balilingualロゴ
  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.7)"/></filter></defs>
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle" filter="url(#s)">Barilingual</text>
  </svg>`);

  // 番号バッジ
  const badgeSvg = Buffer.from(`<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="40" fill="#E67E22"/>
    <text x="40" y="52" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">${spotData.spotNumber}</text>
  </svg>`);

  // スポット名（pill背景付き）
  const nameLines = wrapText(spotData.spotName, 14);
  const nameSvg = textToSvg(nameLines, { fontSize: 48, fontWeight: "900", y: 180 });
  const nameBoxHeight = nameLines.length * 48 * 1.5 + 20;
  const nameBoxSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${WIDTH / 2 - 350}" y="155" width="700" height="${nameBoxHeight}" rx="12" fill="rgba(0,0,0,0.45)"/>
  </svg>`);

  // 下部グラデーション
  const gradHeight = 500;
  const gradSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0)" stop-opacity="0"/>
      <stop offset="0.15" stop-color="rgba(0,0,0,0.9)" stop-opacity="0.9"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.95)" stop-opacity="0.95"/>
    </linearGradient></defs>
    <rect x="0" y="${HEIGHT - gradHeight}" width="${WIDTH}" height="${gradHeight}" fill="url(#g)"/>
  </svg>`);

  // 説明文
  const descLines = wrapText(spotData.description, 24);
  const descSvg = textToSvg(descLines, { fontSize: 30, fontWeight: "700", y: HEIGHT - gradHeight + 100, x: 40, align: "start" });

  const composites = [
    { input: logoSvg, top: 20, left: 0 },
    { input: badgeSvg, top: 90, left: 40 },
    { input: nameBoxSvg, top: 0, left: 0 },
    { input: nameSvg.svg, top: 0, left: 0 },
    { input: gradSvg, top: 0, left: 0 },
    { input: descSvg.svg, top: 0, left: 0 },
  ];

  if (spotData.hours) {
    const hoursSvg = textToSvg([`⏰ ${spotData.hours}`], { fontSize: 28, y: HEIGHT - 80, x: 40, align: "start" });
    composites.push({ input: hoursSvg.svg, top: 0, left: 0 });
  }

  return sharp(bg).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// --- まとめスライド（写真なし、トロピカルグラデーション） ---
async function generateSummary(summaryData) {
  // トロピカルグラデーション背景
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const bg = await sharp(Buffer.from(bgSvg)).jpeg({ quality: 90 }).toBuffer();

  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle">Barilingual</text>
  </svg>`);

  const titleSvg = textToSvg(["まとめ"], { fontSize: 40, fontWeight: "900", y: 120, shadow: false });

  const spotElements = summaryData.spots.map((spot, i) => {
    const y = 200 + i * 180;
    return Buffer.from(`<svg width="${WIDTH}" height="180" xmlns="http://www.w3.org/2000/svg">
      <circle cx="70" cy="50" r="28" fill="#E67E22"/>
      <text x="70" y="60" font-family="${FONT_FAMILY}" font-size="24" font-weight="900" fill="white" text-anchor="middle">${spot.number}</text>
      <text x="120" y="42" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white">${escapeXml(spot.name)}</text>
      <text x="120" y="78" font-family="${FONT_FAMILY}" font-size="24" font-weight="700" fill="rgba(255,255,255,0.8)">${escapeXml(spot.oneLiner)}</text>
      <line x1="48" y1="110" x2="${WIDTH - 48}" y2="110" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`);
  });

  const composites = [
    { input: logoSvg, top: 20, left: 0 },
    { input: titleSvg.svg, top: 0, left: 0 },
    ...spotElements.map((svg, i) => ({ input: svg, top: 200 + i * 160, left: 0 })),
  ];

  return sharp(bg).composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// --- CTAスライド ---
async function generateCta() {
  const bgSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004D40"/>
      <stop offset="35%" stop-color="#00695C"/>
      <stop offset="70%" stop-color="#00897B"/>
      <stop offset="100%" stop-color="#00BCD4"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  </svg>`);

  const bg = await sharp(Buffer.from(bgSvg)).jpeg({ quality: 90 }).toBuffer();

  const logoSvg = Buffer.from(`<svg width="${WIDTH}" height="80" xmlns="http://www.w3.org/2000/svg">
    <text x="${WIDTH / 2}" y="50" font-family="${FONT_FAMILY}" font-size="36" font-weight="700" fill="white" text-anchor="middle">Barilingual</text>
  </svg>`);

  const mainText = textToSvg(["保存してバリ旅行の", "参考にしてね！"], { fontSize: 48, fontWeight: "900", y: 480, shadow: false });

  const buttonSvg = Buffer.from(`<svg width="${WIDTH}" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect x="${WIDTH / 2 - 220}" y="10" width="440" height="70" rx="35" fill="#E67E22"/>
    <text x="${WIDTH / 2}" y="55" font-family="${FONT_FAMILY}" font-size="32" font-weight="900" fill="white" text-anchor="middle">フォローで最新情報をGET</text>
  </svg>`);

  const subText = textToSvg(["バリ島のおすすめスポットを", "毎日配信中！"], { fontSize: 30, fontWeight: "700", color: "rgba(255,255,255,0.8)", y: 750, shadow: false });

  return sharp(bg)
    .composite([
      { input: logoSvg, top: 20, left: 0 },
      { input: mainText.svg, top: 0, left: 0 },
      { input: buttonSvg, top: 620, left: 0 },
      { input: subText.svg, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// --- 全スライド生成 ---
async function generateAllSlides(contentJson) {
  const slides = [];

  // 1. カバー
  slides.push(await generateCover(contentJson.coverData));

  // 2-6. スポット
  for (const spot of contentJson.spotsData) {
    slides.push(await generateSpot(spot));
  }

  // 7. まとめ
  slides.push(await generateSummary(contentJson.summaryData));

  // 8. CTA
  slides.push(await generateCta());

  return slides;
}

// --- メイン ---
async function main() {
  setupFonts();

  console.log("[generate-images] Fetching pending content...");
  const res = await fetch(`${WORKER_URL}/api/pending-images`);
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.log("[generate-images] No pending content.");
    return;
  }

  console.log(`[generate-images] ${data.items.length} items to process`);

  for (const item of data.items) {
    console.log(`[generate-images] Processing #${item.id}: ${item.category}`);

    try {
      const contentJson = JSON.parse(item.content_json);
      const jpegBuffers = await generateAllSlides(contentJson);

      // Base64エンコードしてWorker APIに送信
      const slides = jpegBuffers.map((buf, i) => ({
        index: i,
        imageBase64: buf.toString("base64"),
      }));

      // 大きすぎる場合は2枚ずつ分割送信
      const BATCH_SIZE = 2;
      for (let i = 0; i < slides.length; i += BATCH_SIZE) {
        const batch = slides.slice(i, i + BATCH_SIZE);
        const uploadRes = await fetch(`${WORKER_URL}/api/slides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId: item.id, slides: batch }),
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          throw new Error(`Upload failed: ${err}`);
        }

        console.log(`[generate-images] Uploaded slides ${i + 1}-${Math.min(i + BATCH_SIZE, slides.length)} for #${item.id}`);
      }

      console.log(`[generate-images] Done #${item.id}`);
    } catch (err) {
      console.error(`[generate-images] Error #${item.id}:`, err.message);
    }
  }

  console.log("[generate-images] All done.");
}

main().catch(console.error);
```

- [ ] **Step 2: Run tsc (not applicable - mjs) but verify syntax**

Run: `node --check ig-auto-poster/scripts/generate-images.mjs`
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add ig-auto-poster/scripts/generate-images.mjs
git commit -m "feat(ig-auto-poster): add Sharp-based image generation script for GH Actions"
```

---

### Task 4: GitHub Actions ワークフロー

**Files:**
- Create: `ig-auto-poster/.github/workflows/generate-ig-images.yml`

- [ ] **Step 1: Create workflow file**

```yaml
name: Generate IG Images

on:
  schedule:
    # 30分毎に実行（バリ時間の日中をカバー）
    - cron: '*/30 * * * *'
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: ig-auto-poster

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # フォント取得
      - name: Download fonts
        run: |
          mkdir -p scripts/fonts
          curl -sL "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Black.ttf" -o scripts/fonts/ZenMaruGothic-Black.ttf
          curl -sL "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Bold.ttf" -o scripts/fonts/ZenMaruGothic-Bold.ttf

      # 依存インストール（sharpとcanvas）
      - name: Install dependencies
        run: npm install sharp canvas

      # 画像生成
      - name: Generate images
        run: node scripts/generate-images.mjs
        env:
          WORKER_URL: https://ig-auto-poster.archbridge24.workers.dev
```

- [ ] **Step 2: Commit**

```bash
mkdir -p ig-auto-poster/.github/workflows
git add ig-auto-poster/.github/workflows/generate-ig-images.yml
git commit -m "ci(ig-auto-poster): add GH Actions workflow for Sharp image generation"
```

---

### Task 5: Gallery修正（slideUrlsベース表示）

**Files:**
- Modify: `ig-auto-poster/src/gallery.ts`

- [ ] **Step 1: Update renderGalleryDetail to show slideUrls**

gallery.ts の `renderGalleryDetail` を修正。`slideUrls` があれば全スライド画像を表示、なければ「画像生成待ち」と表示。Satori previewボタンは削除。

```typescript
// slideUrls表示部分を修正:
const slideUrls = parsed.slideUrls ?? [];
const slidesHtml = slideUrls.length > 0
  ? slideUrls.map((url, i) => `<div style="margin:8px 0"><p style="color:#666;font-size:14px">Slide ${i + 1}</p><img src="${escapeHtml(url)}" style="max-width:100%;border-radius:8px"></div>`).join("")
  : `<p style="color:#999">画像生成待ち... GitHub Actionsで自動生成されます</p>`;
```

gallery detail のHTMLテンプレートから JS (generateSlides関数) とpreviewボタンを削除し、`${slidesHtml}` で置換。

- [ ] **Step 2: Update renderGalleryList status badges**

pending_images ステータスのバッジを追加:
```typescript
const statusBadge: Record<string, string> = {
  pending_images: "⏳ 画像生成中",
  pending_review: "🟡 レビュー待ち",
  // ...
};
```

- [ ] **Step 3: Run tsc**

Run: `cd ig-auto-poster && npx tsc --noEmit`

- [ ] **Step 4: Deploy**

Run: `cd ig-auto-poster && npx wrangler deploy`

- [ ] **Step 5: Commit**

```bash
git add ig-auto-poster/src/gallery.ts
git commit -m "fix(ig-auto-poster): update gallery for Sharp pipeline (slideUrls display)"
```

---

### Task 6: E2Eテスト

**Files:**
- No file changes

- [ ] **Step 1: Generate content**

Run: `curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/generate`
Expected: `{ "success": true }`

- [ ] **Step 2: Verify pending_images status**

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/status | python3 -c "import sys,json; d=json.load(sys.stdin); print('pending_images check OK')" `

Run: `curl -s https://ig-auto-poster.archbridge24.workers.dev/api/pending-images`
Expected: items配列に1件以上

- [ ] **Step 3: Run Sharp script locally for testing**

```bash
cd ig-auto-poster
npm install sharp canvas
curl -sL "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Black.ttf" -o scripts/fonts/ZenMaruGothic-Black.ttf
curl -sL "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Bold.ttf" -o scripts/fonts/ZenMaruGothic-Bold.ttf
WORKER_URL=https://ig-auto-poster.archbridge24.workers.dev node scripts/generate-images.mjs
```

Expected: 全スライドが生成・アップロードされ、ギャラリーで確認可能になる

- [ ] **Step 4: Verify gallery shows all slides**

Open: `https://ig-auto-poster.archbridge24.workers.dev/gallery`
Expected: ステータスが "レビュー待ち" に変わり、全スライド画像が表示される

- [ ] **Step 5: Record in progress.md**

作業完了ログを `.company/secretary/notes/2026-03-30-progress.md` に追記
