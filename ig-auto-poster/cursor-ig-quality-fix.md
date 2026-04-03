# IG投稿画像品質修正 — Cursor指示書

## 背景
現在の画像生成は `media-generator.ts` のSVG直描画（V1）を使用。
単色背景にテキストのみ、写真なし、フォント未埋め込みでクオリティが低い。

V2テンプレート（`src/templates/bali-*.ts`）は写真背景+Satoriレイアウトで高品質に設計済みだが、
Satori本体が削除されており未接続。

## やること

### Task 1: Satori + @resvg/resvg-js インストール

```bash
cd ig-auto-poster
pnpm add satori @resvg/resvg-js
```

フォントファイルも必要:
```bash
mkdir -p assets/fonts
curl -L "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Black.ttf" -o assets/fonts/ZenMaruGothic-Black.ttf
curl -L "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Bold.ttf" -o assets/fonts/ZenMaruGothic-Bold.ttf
```

### Task 2: SatoriレンダラーをV2用に作成

`src/pipeline/satori-renderer.ts` を新規作成:

```typescript
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join } from "path";
import type { SatoriNode } from "../satori-types";

const WIDTH = 1080;
const HEIGHT = 1350;

let fontDataBold: ArrayBuffer | null = null;
let fontDataBlack: ArrayBuffer | null = null;

function loadFonts() {
  if (!fontDataBold) {
    const fontsDir = join(__dirname, "../../assets/fonts");
    fontDataBold = readFileSync(join(fontsDir, "ZenMaruGothic-Bold.ttf")).buffer;
    fontDataBlack = readFileSync(join(fontsDir, "ZenMaruGothic-Black.ttf")).buffer;
  }
}

export async function renderSatoriNode(node: SatoriNode): Promise<Buffer> {
  loadFonts();

  const svg = await satori(node as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Zen Maru Gothic",
        data: fontDataBold!,
        weight: 700,
        style: "normal",
      },
      {
        name: "Zen Maru Gothic",
        data: fontDataBlack!,
        weight: 900,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function renderV2Slides(nodes: SatoriNode[]): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (const node of nodes) {
    buffers.push(await renderSatoriNode(node));
  }
  return buffers;
}
```

### Task 3: weekly.ts を V2パイプラインに切り替え

`batch/weekly.ts` の変更:

1. import追加:
```typescript
import { buildV2Slides, type BaliContentV2 } from "../src/templates/index";
import { renderV2Slides } from "../src/pipeline/satori-renderer";
```

2. Step 4のコンテンツ生成プロンプトを変更。現在のGroqプロンプト（`buildPromptForPlan`）の出力を `BaliContentV2` 形式に合わせる。

3. 画像生成部分（L203-210）を差し替え:
```typescript
// Before:
// imageBuffers = await generateCarouselImages(plan, design);

// After:
const v2Content: BaliContentV2 = {
  category,
  area: planJson.area ?? "バリ島",
  title: planJson.title ?? plan.hook,
  coverData: planJson.coverData,
  spotsData: planJson.spotsData,
  summaryData: planJson.summaryData,
  caption: "", // 後で生成
  attributions: planJson.attributions ?? [],
};
const v2Nodes = buildV2Slides(v2Content);
imageBuffers = await renderV2Slides(v2Nodes);
```

4. Groqへのプロンプトを `BaliContentV2` 形式のJSONを返すように修正。必要なフィールド:
   - `category`, `area`, `title`
   - `coverData`: `{ imageUrl, catchCopy, mainTitle, countLabel }`
   - `spotsData[]`: `{ imageUrl, spotNumber, spotName, description }`
   - `summaryData`: `{ title, spots[]: { number, name, oneLiner } }`

### Task 4: content-planner.ts にV2用プロンプトビルダー追加

`buildPromptForV2Plan()` を新規作成。Groqに以下を要求:
- エリア名（ウブド、クタ等）
- カテゴリに応じた5スポット
- 各スポットの説明文（50文字以内）
- カバー用キャッチコピー

画像URLはPexels API or Unsplashから取得する別関数で補完する。
Groqの出力JSONにはimageUrlを含めない（LLMに画像URLを生成させない）。

### Task 5: Pexels画像取得関数

`src/pipeline/image-fetcher.ts` を新規作成:

```typescript
export async function fetchPexelsImage(query: string, orientation: "portrait" = "portrait"): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("Missing PEXELS_API_KEY");

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=5`,
    { headers: { Authorization: apiKey } }
  );
  const data = await res.json() as { photos: { src: { large2x: string } }[] };
  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  return photo?.src.large2x ?? "";
}
```

spotsData生成後に各スポットの画像をPexelsから取得してURLを埋める。

## 検証方法

```bash
cd ig-auto-poster/batch
npx tsx weekly.ts  # 環境変数設定済みの前提
```

生成されたスライドを `scripts/ig-preview.sh` でローカル確認:
```bash
./scripts/ig-preview.sh "https://ig-auto-poster.archbridge24.workers.dev/images/v4/2026-W14/0" 10
```

## Done when

1. `tsc --noEmit` がエラー0で通る
2. 生成されたスライド画像に背景写真が表示される
3. 日本語テキストが正しくレンダリングされる（豆腐なし）
4. テキストが画像からはみ出さない
5. post-15相当のコンテンツで8枚のスライドが生成される

## 注意

- `media-generator.ts` のV1コードは削除せず残す（V1投稿の再生成に必要な場合がある）
- Pexels APIキーが必要。環境変数 `PEXELS_API_KEY` として設定
- フォントファイルは `.gitignore` に追加しない（CIでも必要）
