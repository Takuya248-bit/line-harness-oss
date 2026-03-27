# ig-auto-poster ブラッシュアップ 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ig-auto-posterの画像レイアウトをSatoriベースに移行し、Claude APIによるコンテンツ自動生成とLINEプレビュー承認フローを追加する

**Architecture:** SVG手書きテンプレート → Satori（JSXライクオブジェクト→SVG）+ resvg-wasm（SVG→PNG）に移行。コンテンツはClaude Haiku 3.5で自動生成しD1に保存。LINEプレビュー送信→クイックリプライ承認→Instagram投稿の3段階フロー。

**Tech Stack:** Cloudflare Workers, Satori, @cf-wasm/resvg, @anthropic-ai/sdk, LINE Messaging API, Instagram Graph API, D1, R2

---

## ファイル構成

### 新規作成
- `ig-auto-poster/src/templates/styles.ts` — 共通カラー・フォント定数
- `ig-auto-poster/src/templates/base.ts` — 共通レイアウト要素（背景、ボトムバー、装飾）
- `ig-auto-poster/src/templates/cover.ts` — 表紙スライドテンプレート
- `ig-auto-poster/src/templates/cta.ts` — CTAスライドテンプレート
- `ig-auto-poster/src/templates/list-slide.ts` — リスト型スライド
- `ig-auto-poster/src/templates/quiz-question.ts` — クイズ問題スライド
- `ig-auto-poster/src/templates/quiz-answer.ts` — クイズ回答スライド
- `ig-auto-poster/src/templates/before-after.ts` — Before/Afterスライド
- `ig-auto-poster/src/templates/situation.ts` — シチュエーション型スライド
- `ig-auto-poster/src/templates/story.ts` — ストーリー型スライド
- `ig-auto-poster/src/templates/student.ts` — 生徒あるある型スライド
- `ig-auto-poster/src/templates/bali-report.ts` — バリレポ型スライド
- `ig-auto-poster/src/templates/index.ts` — テンプレート選択ディスパッチャ
- `ig-auto-poster/src/content-generator.ts` — Claude API連携コンテンツ生成
- `ig-auto-poster/src/line-preview.ts` — LINEプレビュー送信・承認管理
- `ig-auto-poster/migrations/0002_generated_content.sql` — generated_contentテーブル

### 変更
- `ig-auto-poster/package.json` — satori, @anthropic-ai/sdk 依存追加
- `ig-auto-poster/tsconfig.json` — jsx設定追加（Satoriのため）
- `ig-auto-poster/wrangler.toml` — Cron変更、Secrets追加ドキュメント
- `ig-auto-poster/src/image-generator.ts` — Satoriラッパーに書き換え（SVGベタ書き全削除）
- `ig-auto-poster/src/index.ts` — Env拡張、/line-webhook追加、Cronフロー変更

### 変更なし
- `ig-auto-poster/src/instagram.ts` — そのまま利用
- `ig-auto-poster/src/captions.ts` — フォールバック用に残す
- `ig-auto-poster/src/content-data.ts` — 既存データ維持

---

## Task 1: プロジェクト設定・依存関係追加

**Files:**
- Modify: `ig-auto-poster/package.json`
- Modify: `ig-auto-poster/tsconfig.json`

- [ ] **Step 1: satori と @anthropic-ai/sdk をインストール**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm add satori @anthropic-ai/sdk
```

`satori` はJSXライクなオブジェクトからSVGを生成するライブラリ。React不要。
`@anthropic-ai/sdk` はClaude APIクライアント。

- [ ] **Step 2: tsconfig.jsonにjsx設定を追加**

`ig-auto-poster/tsconfig.json` を以下のように変更:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "jsx": "react-jsx",
    "jsxImportSource": "satori",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

注意: Satoriは実際にはReact JSXランタイムを使わず、プレーンオブジェクトを受け取る。テンプレートは `.ts` ファイルでオブジェクトリテラルとして記述する（`.tsx`不要）。`jsx`設定はエディタの型チェックサポート用。

- [ ] **Step 3: typecheckを実行して既存コードが壊れていないことを確認**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 既存のエラーがなければ0エラー。

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/package.json ig-auto-poster/pnpm-lock.yaml ig-auto-poster/tsconfig.json
git commit -m "chore(ig-auto-poster): add satori and anthropic-sdk dependencies"
```

---

## Task 2: 共通スタイル・ベースレイアウト

**Files:**
- Create: `ig-auto-poster/src/templates/styles.ts`
- Create: `ig-auto-poster/src/templates/base.ts`

- [ ] **Step 1: styles.tsを作成**

`ig-auto-poster/src/templates/styles.ts`:

```ts
// 共通カラーパレット（既存SVGテンプレートから移植）
export const COLORS = {
  navy: "#1A237E",
  turquoise: "#00BCD4",
  orange: "#FF6F00",
  gray: "#757575",
  lightGray: "#FAFAFA",
  white: "#FFFFFF",
  bgLight: "#E0F7FA",
} as const;

// 画像サイズ（Instagram推奨 4:5）
export const WIDTH = 1080;
export const HEIGHT = 1350;

// フォント名（SatoriのfontName指定と一致させる）
export const FONT_FAMILY = "Zen Maru Gothic";

// フォントURL（GitHubからフェッチ、将来R2キャッシュ化予定）
export const FONT_BOLD_URL =
  "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Black.ttf";
export const FONT_MEDIUM_URL =
  "https://raw.githubusercontent.com/googlefonts/zen-marugothic/main/fonts/ttf/ZenMaruGothic-Bold.ttf";
```

- [ ] **Step 2: base.tsを作成**

`ig-auto-poster/src/templates/base.ts`:

Satoriはプレーンオブジェクトを受け取る。`React.createElement`相当のヘルパー関数`h`を定義し、テンプレート記述を簡潔にする。

```ts
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, HEIGHT, FONT_FAMILY } from "./styles";

// Satoriノード作成ヘルパー
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: (SatoriNode | string)[]
): SatoriNode {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children.length > 0 ? children : undefined,
    },
  };
}

// 共通: ボトムバー
export function bottomBar(): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: WIDTH,
      height: 82,
      backgroundColor: "rgba(0,77,64,0.85)",
    },
  },
    h("span", {
      style: {
        fontSize: 30,
        color: "rgba(255,255,255,0.9)",
        fontFamily: FONT_FAMILY,
      },
    }, "Barilingual | バリ島で英語を学ぼう"),
  );
}

// 共通: トロピカルグラデーション背景（カバー・CTA用）
export function tropicalBackground(...children: SatoriNode[]): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      background: "linear-gradient(135deg, #004D40 0%, #00695C 35%, #00897B 70%, #00BCD4 100%)",
      fontFamily: FONT_FAMILY,
    },
  }, ...children);
}

// 共通: ライト背景（コンテンツスライド用）
export function lightBackground(...children: SatoriNode[]): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: HEIGHT,
      background: "linear-gradient(180deg, #E0F2F1 0%, #B2DFDB 50%, #E0F7FA 100%)",
      fontFamily: FONT_FAMILY,
    },
  }, ...children);
}

// 共通: ページバッジ
export function pageBadge(label: string): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: COLORS.turquoise,
    },
  },
    h("span", {
      style: {
        fontSize: 36,
        fontWeight: 700,
        color: COLORS.white,
        fontFamily: FONT_FAMILY,
      },
    }, label),
  );
}
```

- [ ] **Step 3: SatoriNode型定義を作成**

`ig-auto-poster/src/satori-types.ts`:

```ts
// Satoriが受け取るノードの型定義
export interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriNode | SatoriNode[] | string | (SatoriNode | string)[];
    [key: string]: unknown;
  };
}
```

- [ ] **Step 4: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 0エラー

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/templates/styles.ts ig-auto-poster/src/templates/base.ts ig-auto-poster/src/satori-types.ts
git commit -m "feat(ig-auto-poster): add shared styles, base layout components, and SatoriNode types"
```

---

## Task 3: Satoriレンダリングエンジン（image-generator.ts書き換え）

**Files:**
- Modify: `ig-auto-poster/src/image-generator.ts`

- [ ] **Step 1: image-generator.tsをSatoriラッパーに書き換え**

既存の800行超のSVGテンプレートコードを全削除し、以下に置き換える。

`ig-auto-poster/src/image-generator.ts`:

```ts
import { Resvg } from "@cf-wasm/resvg/workerd";
import satori from "satori";
import type { ContentItem } from "./content-data";
import type { SatoriNode } from "./satori-types";
import { WIDTH, HEIGHT, FONT_FAMILY, FONT_BOLD_URL, FONT_MEDIUM_URL } from "./templates/styles";
import { buildSlides } from "./templates/index";

// --- Font Cache ---
let fontBoldData: ArrayBuffer | null = null;
let fontMediumData: ArrayBuffer | null = null;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  return res.arrayBuffer();
}

async function ensureFonts(): Promise<void> {
  if (fontBoldData && fontMediumData) return;
  const [bold, medium] = await Promise.all([
    fetchFont(FONT_BOLD_URL),
    fetchFont(FONT_MEDIUM_URL),
  ]);
  fontBoldData = bold;
  fontMediumData = medium;
}

// Satori JSXオブジェクト → SVG文字列 → PNG Uint8Array
async function renderNode(node: SatoriNode): Promise<Uint8Array> {
  await ensureFonts();

  const svg = await satori(node as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: FONT_FAMILY, data: fontBoldData!, weight: 900, style: "normal" },
      { name: FONT_FAMILY, data: fontMediumData!, weight: 700, style: "normal" },
    ],
  });

  const resvg = await Resvg.async(svg, {
    fitTo: { mode: "width" as const, value: WIDTH },
    font: {
      fontBuffers: [new Uint8Array(fontBoldData!), new Uint8Array(fontMediumData!)],
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

// メインAPI: ContentItem → PNG画像配列
export async function generateSlideImages(content: ContentItem): Promise<Uint8Array[]> {
  const nodes = buildSlides(content);
  const images: Uint8Array[] = [];
  for (const node of nodes) {
    const png = await renderNode(node);
    images.push(png);
  }
  return images;
}
```

- [ ] **Step 2: テンプレートディスパッチャを作成**

`ig-auto-poster/src/templates/index.ts`:

```ts
import type { ContentItem, SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { buildCoverNode } from "./cover";
import { buildCtaNode } from "./cta";
import { buildListSlideNode } from "./list-slide";
import { buildQuizQuestionNode } from "./quiz-question";
import { buildQuizAnswerNode } from "./quiz-answer";
import { buildBeforeAfterNode } from "./before-after";
import { buildSituationNode } from "./situation";
import { buildStoryNode } from "./story";
import { buildStudentNode } from "./student";
import { buildBaliReportNode } from "./bali-report";

function buildContentNode(
  content: ContentItem,
  slide: SlideData,
  slideIndex: number,
  totalContentSlides: number,
): SatoriNode {
  const pageLabel = `${slideIndex}/${totalContentSlides}`;

  switch (content.type) {
    case "list":
      return buildListSlideNode(slide, pageLabel);
    case "quiz":
      // 奇数スライドが問題、偶数が回答
      return slide.slideNumber % 2 === 0
        ? buildQuizQuestionNode(slide)
        : buildQuizAnswerNode(slide);
    case "before_after":
      return buildBeforeAfterNode(slide);
    case "situation":
      return buildSituationNode(slide);
    case "story":
      return buildStoryNode(slide);
    case "student_mistake":
      return buildStudentNode(slide);
    case "bali_report":
      return buildBaliReportNode(slide);
    default:
      return buildListSlideNode(slide, pageLabel);
  }
}

export function buildSlides(content: ContentItem): SatoriNode[] {
  const nodes: SatoriNode[] = [];
  const contentSlides = content.slides.filter((s) => s.slideType === "content");
  let contentIndex = 0;

  for (const slide of content.slides) {
    if (slide.slideType === "cover") {
      nodes.push(buildCoverNode(content.title, content.subtitle));
    } else if (slide.slideType === "cta") {
      nodes.push(buildCtaNode(slide.leadMagnet ?? ""));
    } else {
      contentIndex++;
      nodes.push(buildContentNode(content, slide, contentIndex, contentSlides.length));
    }
  }

  return nodes;
}
```

注意: 個別テンプレートファイル（cover.ts等）はTask 4-8で作成する。この時点ではtypecheckは通らない。

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/image-generator.ts ig-auto-poster/src/templates/index.ts
git commit -m "feat(ig-auto-poster): rewrite image-generator to use Satori rendering engine"
```

---

## Task 4: Cover・CTAテンプレート

**Files:**
- Create: `ig-auto-poster/src/templates/cover.ts`
- Create: `ig-auto-poster/src/templates/cta.ts`

- [ ] **Step 1: cover.tsを作成**

`ig-auto-poster/src/templates/cover.ts`:

```ts
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, HEIGHT, FONT_FAMILY } from "./styles";
import { h, bottomBar, tropicalBackground } from "./base";

export function buildCoverNode(title: string, subtitle: string): SatoriNode {
  const titleLines = title.split("\n");

  return tropicalBackground(
    // メインコンテンツ（flex: 1で残りスペースを占有）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: 60,
      },
    },
      // バッジ「保存必須」
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 12,
          paddingBottom: 12,
          borderRadius: 35,
          backgroundColor: COLORS.orange,
          marginBottom: 40,
        },
      },
        h("span", {
          style: { fontSize: 36, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
        }, "保存必須"),
      ),
      // タイトル（複数行対応）
      ...titleLines.map((line) =>
        h("span", {
          style: {
            fontSize: 104,
            fontWeight: 700,
            color: COLORS.white,
            fontFamily: FONT_FAMILY,
            textAlign: "center",
            lineHeight: 1.3,
          },
        }, line),
      ),
      // サブタイトル
      h("span", {
        style: {
          fontSize: 48,
          fontWeight: 700,
          color: "rgba(255,255,255,0.9)",
          fontFamily: FONT_FAMILY,
          marginTop: 40,
        },
      }, subtitle),
      // スワイプ誘導ピル
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 60,
          paddingRight: 60,
          paddingTop: 16,
          paddingBottom: 16,
          borderRadius: 33,
          backgroundColor: "rgba(255,255,255,0.18)",
          marginTop: 40,
        },
      },
        h("span", {
          style: { fontSize: 34, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
        }, "→ スワイプで全部見る"),
      ),
    ),
    // ボトムバー
    bottomBar(),
  );
}
```

- [ ] **Step 2: cta.tsを作成**

`ig-auto-poster/src/templates/cta.ts`:

```ts
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar, tropicalBackground } from "./base";

export function buildCtaNode(_leadMagnet: string): SatoriNode {
  return tropicalBackground(
    // メインコンテンツ
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        padding: 70,
        gap: 40,
      },
    },
      // メインCTAカード
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          backgroundColor: COLORS.white,
          borderRadius: 30,
          padding: 50,
          gap: 30,
        },
      },
        h("span", {
          style: { fontSize: 72, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY },
        }, "好きな英単語を"),
        h("span", {
          style: { fontSize: 72, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY },
        }, "コメントしてね!"),
        // オレンジボタン
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            paddingTop: 24,
            paddingBottom: 24,
            borderRadius: 50,
            backgroundColor: COLORS.orange,
          },
        },
          h("span", {
            style: { fontSize: 46, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
          }, "コメントでプレゼントGET"),
        ),
      ),
      // プレゼント内容カード
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          backgroundColor: "rgba(255,255,255,0.95)",
          borderRadius: 30,
          padding: 50,
          gap: 20,
          borderTop: `8px solid ${COLORS.orange}`,
        },
      },
        h("span", {
          style: { fontSize: 44, fontWeight: 700, color: COLORS.gray, fontFamily: FONT_FAMILY },
        }, "無料プレゼント"),
        h("span", {
          style: { fontSize: 64, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY },
        }, "レベル別"),
        h("span", {
          style: { fontSize: 60, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY },
        }, "英語学習ロードマップ"),
      ),
      // フォロー誘導
      h("span", {
        style: { fontSize: 34, color: COLORS.white, fontFamily: FONT_FAMILY },
      }, "@balilingirl をフォロー"),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 3: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: cover.ts, cta.ts自体のエラーはない（index.tsの他テンプレートimportエラーはまだ残る）

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/templates/cover.ts ig-auto-poster/src/templates/cta.ts
git commit -m "feat(ig-auto-poster): add Satori cover and CTA templates"
```

---

## Task 5: リスト型・クイズ型テンプレート

**Files:**
- Create: `ig-auto-poster/src/templates/list-slide.ts`
- Create: `ig-auto-poster/src/templates/quiz-question.ts`
- Create: `ig-auto-poster/src/templates/quiz-answer.ts`

- [ ] **Step 1: list-slide.tsを作成**

`ig-auto-poster/src/templates/list-slide.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, FONT_FAMILY } from "./styles";
import { h, bottomBar, lightBackground, pageBadge } from "./base";

export function buildListSlideNode(slide: SlideData, pageLabel: string): SatoriNode {
  return lightBackground(
    // ページバッジ
    h("div", { style: { display: "flex", padding: 30 } },
      pageBadge(pageLabel),
    ),
    // 白カード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        margin: "0 40px",
        padding: 50,
        backgroundColor: COLORS.white,
        borderRadius: 30,
        opacity: 0.92,
        gap: 20,
      },
    },
      // 英語フレーズ（自動折り返し）
      h("span", {
        style: {
          fontSize: 80,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.phraseEn ?? ""),
      // 日本語訳
      h("span", {
        style: { fontSize: 46, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.phraseJp ?? ""),
      // 区切り線
      h("div", {
        style: {
          width: "100%",
          height: 3,
          backgroundColor: COLORS.turquoise,
          opacity: 0.4,
          marginTop: 20,
          marginBottom: 20,
        },
      }),
      // Exampleラベル
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 180,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 25,
          backgroundColor: "rgba(0,188,212,0.15)",
        },
      },
        h("span", {
          style: { fontSize: 32, fontWeight: 700, color: COLORS.turquoise, fontFamily: FONT_FAMILY },
        }, "Example"),
      ),
      // 例文（英語）
      h("span", {
        style: {
          fontSize: 46,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
          marginTop: 10,
        },
      }, slide.exampleEn ?? ""),
      // 例文（日本語）
      h("span", {
        style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY, wordBreak: "break-word" },
      }, slide.exampleJp ?? ""),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 2: quiz-question.tsを作成**

`ig-auto-poster/src/templates/quiz-question.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildQuizQuestionNode(slide: SlideData): SatoriNode {
  const options = [
    { label: "A", text: slide.optionA ?? "" },
    { label: "B", text: slide.optionB ?? "" },
    { label: "C", text: slide.optionC ?? "" },
  ];

  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      background: "linear-gradient(180deg, #FFF8E1 0%, #FFF3E0 100%)",
      fontFamily: FONT_FAMILY,
    },
  },
    // オレンジヘッダー
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: WIDTH,
        height: 240,
        backgroundColor: COLORS.orange,
      },
    },
      h("span", {
        style: { fontSize: 120, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
      }, "Q."),
    ),
    // 問題文
    h("div", {
      style: {
        display: "flex",
        padding: "40px 80px",
      },
    },
      h("span", {
        style: {
          fontSize: 60,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.questionJp ?? ""),
    ),
    // 選択肢
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "0 70px",
        gap: 20,
        flex: 1,
      },
    },
      ...options.map((opt) =>
        h("div", {
          style: {
            display: "flex",
            alignItems: "center",
            width: "100%",
            padding: "24px 30px",
            borderRadius: 24,
            backgroundColor: COLORS.white,
            border: "2px solid #E0E0E0",
            gap: 20,
          },
        },
          // ラベル円
          h("div", {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "rgba(0,188,212,0.15)",
              flexShrink: 0,
            },
          },
            h("span", {
              style: { fontSize: 34, fontWeight: 700, color: COLORS.turquoise, fontFamily: FONT_FAMILY },
            }, opt.label),
          ),
          h("span", {
            style: {
              fontSize: 46,
              color: COLORS.navy,
              fontFamily: FONT_FAMILY,
              wordBreak: "break-word",
            },
          }, opt.text),
        ),
      ),
    ),
    // スワイプ誘導
    h("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        padding: 30,
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 60,
          paddingRight: 60,
          paddingTop: 16,
          paddingBottom: 16,
          borderRadius: 33,
          backgroundColor: "rgba(0,188,212,0.12)",
        },
      },
        h("span", {
          style: { fontSize: 38, fontWeight: 700, color: COLORS.turquoise, fontFamily: FONT_FAMILY },
        }, "スワイプで答え合わせ"),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 3: quiz-answer.tsを作成**

`ig-auto-poster/src/templates/quiz-answer.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildQuizAnswerNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      background: "linear-gradient(180deg, #E0F7FA 0%, #E0F2F1 100%)",
      fontFamily: FONT_FAMILY,
    },
  },
    // ターコイズヘッダー
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: WIDTH,
        height: 240,
        backgroundColor: COLORS.turquoise,
      },
    },
      h("span", {
        style: { fontSize: 120, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
      }, "A."),
    ),
    // 回答コンテンツ
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "40px 80px",
        gap: 20,
      },
    },
      // 正解ラベル
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 380,
          paddingTop: 14,
          paddingBottom: 14,
          borderRadius: 33,
          backgroundColor: COLORS.orange,
        },
      },
        h("span", {
          style: { fontSize: 42, fontWeight: 700, color: COLORS.white, fontFamily: FONT_FAMILY },
        }, `正解は ${slide.correctOption ?? ""}`),
      ),
      // 回答（英語）
      h("span", {
        style: {
          fontSize: 70,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
          marginTop: 20,
        },
      }, slide.answerEn ?? ""),
      // 回答（日本語）
      h("span", {
        style: { fontSize: 46, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.answerJp ?? ""),
      // 区切り線
      h("div", {
        style: {
          width: "100%",
          height: 3,
          backgroundColor: COLORS.turquoise,
          opacity: 0.4,
          marginTop: 20,
          marginBottom: 20,
        },
      }),
      // 解説ボックス
      h("div", {
        style: {
          display: "flex",
          width: "100%",
          padding: 30,
          backgroundColor: COLORS.white,
          borderRadius: 20,
          opacity: 0.92,
          borderLeft: `6px solid ${COLORS.turquoise}`,
        },
      },
        h("span", {
          style: {
            fontSize: 42,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
          },
        }, slide.explanation ?? ""),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/templates/list-slide.ts ig-auto-poster/src/templates/quiz-question.ts ig-auto-poster/src/templates/quiz-answer.ts
git commit -m "feat(ig-auto-poster): add Satori list, quiz-question, quiz-answer templates"
```

---

## Task 6: Before/After・シチュエーション型テンプレート

**Files:**
- Create: `ig-auto-poster/src/templates/before-after.ts`
- Create: `ig-auto-poster/src/templates/situation.ts`

- [ ] **Step 1: before-after.tsを作成**

`ig-auto-poster/src/templates/before-after.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildBeforeAfterNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      fontFamily: FONT_FAMILY,
    },
  },
    // Before（上半分）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: 40,
        background: "linear-gradient(180deg, #FFF0F0 0%, #FFE0E0 100%)",
        gap: 16,
      },
    },
      // Beforeラベル
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 220,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 28,
          backgroundColor: "#FFCDD2",
        },
      },
        h("span", {
          style: { fontSize: 34, fontWeight: 700, color: "#C62828", fontFamily: FONT_FAMILY },
        }, "日本人英語"),
      ),
      // Before英語
      h("span", {
        style: {
          fontSize: 56,
          color: "#616161",
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
          marginTop: 16,
        },
      }, slide.beforeEn ?? ""),
      // Before日本語
      h("span", {
        style: { fontSize: 38, color: "#9E9E9E", fontFamily: FONT_FAMILY },
      }, slide.beforeJp ?? ""),
      // Xマーク
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: "#FFCDD2",
          marginTop: 10,
        },
      },
        h("span", {
          style: { fontSize: 48, fontWeight: 700, color: "#E53935", fontFamily: FONT_FAMILY },
        }, "X"),
      ),
    ),
    // After（下半分）
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: 40,
        background: "linear-gradient(180deg, #E0F2F1 0%, #B2DFDB 100%)",
        gap: 16,
      },
    },
      // Afterラベル
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 250,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 28,
          backgroundColor: "#B2DFDB",
        },
      },
        h("span", {
          style: { fontSize: 34, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY },
        }, "ネイティブ英語"),
      ),
      // After英語
      h("span", {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
          marginTop: 16,
        },
      }, slide.afterEn ?? ""),
      // After日本語
      h("span", {
        style: { fontSize: 38, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.afterJp ?? ""),
      // Oマーク
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: "#B2DFDB",
          marginTop: 10,
        },
      },
        h("span", {
          style: { fontSize: 48, fontWeight: 700, color: "#2E7D32", fontFamily: FONT_FAMILY },
        }, "O"),
      ),
    ),
    // Tip
    h("div", {
      style: {
        display: "flex",
        padding: "12px 40px",
        backgroundColor: "rgba(255,255,255,0.9)",
      },
    },
      h("span", {
        style: {
          fontSize: 32,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.tip ?? ""),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 2: situation.tsを作成**

既存SVGのsituation型テンプレートを参照して作成する。`ig-auto-poster/src/image-generator.ts`の既存コードにsituation型のSVGテンプレートがあるため、それと同等のレイアウトをSatoriで実装する。

`ig-auto-poster/src/templates/situation.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildSituationNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      background: "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 50%, #E0F2F1 100%)",
      fontFamily: FONT_FAMILY,
    },
  },
    // シーンヘッダー
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 60px",
        gap: 12,
      },
    },
      // シーンバッジ
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 25,
          backgroundColor: "rgba(0,150,136,0.15)",
        },
      },
        h("span", {
          style: { fontSize: 32, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY },
        }, slide.scene ?? ""),
      ),
      h("span", {
        style: { fontSize: 52, fontWeight: 700, color: COLORS.navy, fontFamily: FONT_FAMILY, textAlign: "center" },
      }, slide.sceneTitle ?? ""),
    ),
    // メインコンテンツカード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        margin: "0 40px",
        padding: 40,
        backgroundColor: COLORS.white,
        borderRadius: 30,
        opacity: 0.92,
        gap: 24,
      },
    },
      // フレーズ1
      h("span", {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.phraseEn1 ?? ""),
      h("span", {
        style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.phraseJp1 ?? ""),
      // 区切り
      h("div", {
        style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.3 },
      }),
      // レスポンス
      h("span", {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: "#00695C",
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.responseEn ?? ""),
      h("span", {
        style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.responseJp ?? ""),
      // ポイント
      h("div", {
        style: {
          display: "flex",
          width: "100%",
          padding: 20,
          backgroundColor: "rgba(0,188,212,0.08)",
          borderRadius: 16,
          borderLeft: `4px solid ${COLORS.turquoise}`,
          marginTop: 10,
        },
      },
        h("span", {
          style: {
            fontSize: 34,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
          },
        }, slide.point ?? ""),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/templates/before-after.ts ig-auto-poster/src/templates/situation.ts
git commit -m "feat(ig-auto-poster): add Satori before-after and situation templates"
```

---

## Task 7: ストーリー・生徒あるある・バリレポテンプレート

**Files:**
- Create: `ig-auto-poster/src/templates/story.ts`
- Create: `ig-auto-poster/src/templates/student.ts`
- Create: `ig-auto-poster/src/templates/bali-report.ts`

- [ ] **Step 1: story.tsを作成**

`ig-auto-poster/src/templates/story.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar, lightBackground } from "./base";

export function buildStoryNode(slide: SlideData): SatoriNode {
  return lightBackground(
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "60px 50px",
        gap: 24,
      },
    },
      // タイトル
      h("span", {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.storyTitle ?? ""),
      // 区切り
      h("div", {
        style: { width: 120, height: 4, backgroundColor: COLORS.turquoise, borderRadius: 2 },
      }),
      // 本文（白カード）
      h("div", {
        style: {
          display: "flex",
          flex: 1,
          width: "100%",
          padding: 40,
          backgroundColor: COLORS.white,
          borderRadius: 24,
          opacity: 0.92,
        },
      },
        h("span", {
          style: {
            fontSize: 42,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
            lineHeight: 1.6,
          },
        }, slide.storyBody ?? ""),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 2: student.tsを作成**

`ig-auto-poster/src/templates/student.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildStudentNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      background: "linear-gradient(180deg, #FFF8E1 0%, #FFECB3 50%, #FFF3E0 100%)",
      fontFamily: FONT_FAMILY,
    },
  },
    // ヘッダー
    h("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 60px",
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 25,
          backgroundColor: "rgba(255,111,0,0.15)",
        },
      },
        h("span", {
          style: { fontSize: 36, fontWeight: 700, color: COLORS.orange, fontFamily: FONT_FAMILY },
        }, `あるある #${slide.mistakeNumber ?? ""}`),
      ),
    ),
    // メインカード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        margin: "0 40px",
        padding: 40,
        backgroundColor: COLORS.white,
        borderRadius: 30,
        opacity: 0.92,
        gap: 24,
      },
    },
      // 間違い例
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          padding: 24,
          borderRadius: 20,
          backgroundColor: "#FFF0F0",
          gap: 8,
        },
      },
        h("span", {
          style: { fontSize: 28, fontWeight: 700, color: "#C62828", fontFamily: FONT_FAMILY },
        }, "よくある間違い"),
        h("span", {
          style: {
            fontSize: 52,
            color: "#616161",
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
            textDecoration: "line-through",
          },
        }, slide.mistakeEn ?? ""),
      ),
      // 正解
      h("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          padding: 24,
          borderRadius: 20,
          backgroundColor: "#E8F5E9",
          gap: 8,
        },
      },
        h("span", {
          style: { fontSize: 28, fontWeight: 700, color: "#2E7D32", fontFamily: FONT_FAMILY },
        }, "正しい表現"),
        h("span", {
          style: {
            fontSize: 52,
            fontWeight: 700,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
          },
        }, slide.correctEn ?? ""),
      ),
      // 解説
      h("div", {
        style: {
          display: "flex",
          width: "100%",
          padding: 24,
          borderRadius: 16,
          borderLeft: `4px solid ${COLORS.turquoise}`,
          backgroundColor: "rgba(0,188,212,0.06)",
        },
      },
        h("span", {
          style: {
            fontSize: 38,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
            lineHeight: 1.5,
          },
        }, slide.mistakeExplanation ?? ""),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 3: bali-report.tsを作成**

`ig-auto-poster/src/templates/bali-report.ts`:

```ts
import type { SlideData } from "../content-data";
import type { SatoriNode } from "../satori-types";
import { COLORS, WIDTH, FONT_FAMILY } from "./styles";
import { h, bottomBar } from "./base";

export function buildBaliReportNode(slide: SlideData): SatoriNode {
  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: WIDTH,
      height: 1350,
      background: "linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 40%, #E8F5E9 100%)",
      fontFamily: FONT_FAMILY,
    },
  },
    // ロケーションヘッダー
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 60px",
        gap: 16,
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 25,
          backgroundColor: "rgba(0,188,212,0.15)",
        },
      },
        h("span", {
          style: { fontSize: 32, fontWeight: 700, color: "#00695C", fontFamily: FONT_FAMILY },
        }, "バリ島現地レポ"),
      ),
      h("span", {
        style: {
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          textAlign: "center",
          wordBreak: "break-word",
        },
      }, slide.locationName ?? ""),
    ),
    // メインカード
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        margin: "0 40px",
        padding: 40,
        backgroundColor: COLORS.white,
        borderRadius: 30,
        opacity: 0.92,
        gap: 24,
      },
    },
      // フレーズ
      h("span", {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.navy,
          fontFamily: FONT_FAMILY,
          wordBreak: "break-word",
        },
      }, slide.phraseEn1 ?? slide.phraseEn ?? ""),
      h("span", {
        style: { fontSize: 40, color: COLORS.gray, fontFamily: FONT_FAMILY },
      }, slide.phraseJp1 ?? slide.phraseJp ?? ""),
      // 区切り
      h("div", {
        style: { width: "100%", height: 3, backgroundColor: COLORS.turquoise, opacity: 0.3 },
      }),
      // 使い方Tip
      h("div", {
        style: {
          display: "flex",
          width: "100%",
          padding: 24,
          borderRadius: 16,
          borderLeft: `4px solid ${COLORS.turquoise}`,
          backgroundColor: "rgba(0,188,212,0.06)",
        },
      },
        h("span", {
          style: {
            fontSize: 36,
            color: COLORS.navy,
            fontFamily: FONT_FAMILY,
            wordBreak: "break-word",
            lineHeight: 1.5,
          },
        }, slide.usageTip ?? ""),
      ),
    ),
    bottomBar(),
  );
}
```

- [ ] **Step 4: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 全テンプレートが揃ったので、index.tsのimportが全て解決し0エラーになるはず。

- [ ] **Step 5: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/templates/story.ts ig-auto-poster/src/templates/student.ts ig-auto-poster/src/templates/bali-report.ts
git commit -m "feat(ig-auto-poster): add Satori story, student, bali-report templates"
```

---

## Task 8: Satori動作検証（既存コンテンツでプレビュー生成）

**Files:**
- Modify: `ig-auto-poster/wrangler.toml` (検証のみ、変更なし)

- [ ] **Step 1: wrangler devでローカル起動**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm dev
```

Workers devサーバーが起動することを確認。Satoriのインポートでバンドルエラーが出ないか確認。

- [ ] **Step 2: プレビューAPIでテスト**

別ターミナルで:

```bash
curl -X POST http://localhost:8787/preview -H 'Content-Type: application/json' -d '{"index": 0}'
```

Expected: `{"success": true, "contentIndex": 0, ...}` が返る。imageUrlsに7枚のURLが含まれる。

- [ ] **Step 3: 生成画像をブラウザで確認**

レスポンスの`imageUrls[1]`（2枚目のコンテンツスライド）をブラウザで開き:
- テキストが正しく折り返されているか
- レイアウトが崩れていないか
- フォントが正しく適用されているか

を確認する。

- [ ] **Step 4: 複数テンプレート型でテスト**

リスト型(index:0), クイズ型(index:8), Before/After型(index:16), シチュエーション型(index:23) でそれぞれ生成し、全テンプレート型が正常にレンダリングされることを確認:

```bash
curl -X POST http://localhost:8787/preview -H 'Content-Type: application/json' -d '{"index": 8}'
curl -X POST http://localhost:8787/preview -H 'Content-Type: application/json' -d '{"index": 16}'
curl -X POST http://localhost:8787/preview -H 'Content-Type: application/json' -d '{"index": 23}'
```

- [ ] **Step 5: 問題があれば修正してコミット**

レイアウト崩れがあればテンプレートを調整。修正後:

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/
git commit -m "fix(ig-auto-poster): adjust Satori template layouts after visual review"
```

---

## Task 9: D1マイグレーション（generated_contentテーブル）

**Files:**
- Create: `ig-auto-poster/migrations/0002_generated_content.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

`ig-auto-poster/migrations/0002_generated_content.sql`:

```sql
-- AI生成コンテンツ管理テーブル
CREATE TABLE IF NOT EXISTS generated_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  caption TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  ig_media_id TEXT
);

-- ステータスインデックス（pending_review/approved の検索高速化）
CREATE INDEX IF NOT EXISTS idx_generated_content_status ON generated_content(status);
```

- [ ] **Step 2: ローカルD1にマイグレーション適用**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm migrate --local
```

Expected: `Successfully applied migration 0002_generated_content.sql`

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/migrations/0002_generated_content.sql
git commit -m "feat(ig-auto-poster): add generated_content D1 migration"
```

---

## Task 10: Claude APIコンテンツ生成モジュール

**Files:**
- Create: `ig-auto-poster/src/content-generator.ts`
- Modify: `ig-auto-poster/src/index.ts` (Env拡張)

- [ ] **Step 1: Envインターフェースを拡張**

`ig-auto-poster/src/index.ts` の `Env` インターフェースに以下を追加:

```ts
export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  ANTHROPIC_API_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
}
```

- [ ] **Step 2: content-generator.tsを作成**

`ig-auto-poster/src/content-generator.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { ContentType, ContentItem, SlideData } from "./content-data";

const TEMPLATE_TYPES: ContentType[] = [
  "list", "quiz", "before_after", "situation",
  "story", "student_mistake", "bali_report",
];

const SYSTEM_PROMPT = `あなたはバリ島の語学学校「バリリンガル」のInstagramコンテンツ作成者です。
ターゲット: 英語学習に興味がある日本人（20-40代）
トーン: カジュアルで親しみやすく、実用的
コンテンツは日本人が実際にバリ島や海外で使える英語表現を教える内容です。

必ず以下のJSON形式で返してください。それ以外のテキストは含めないでください。`;

function buildPromptForType(
  templateType: ContentType,
  pastThemes: string[],
): string {
  const pastList = pastThemes.length > 0
    ? `\n\n以下のテーマは既出です。これらと被らないテーマにしてください:\n${pastThemes.map((t) => `- ${t}`).join("\n")}`
    : "";

  const typeInstructions: Record<ContentType, string> = {
    list: `リスト型コンテンツを作成してください。
タイトル（2行以内、改行は\\nで）、サブタイトル、5つのフレーズ（英語、日本語訳、例文英語、例文日本語）を含めてください。

JSON形式:
{
  "type": "list",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "phrases": [
    { "phraseEn": "英語", "phraseJp": "日本語", "exampleEn": "例文英語", "exampleJp": "例文日本語" }
  ]
}`,
    quiz: `クイズ型コンテンツを作成してください。
タイトル、2問のクイズ（日本語の問題文、3択、正解、英語回答、日本語回答、解説）を含めてください。

JSON形式:
{
  "type": "quiz",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "quizzes": [
    { "questionJp": "問題", "optionA": "A", "optionB": "B", "optionC": "C", "correctOption": "A", "answerEn": "英語", "answerJp": "日本語", "explanation": "解説" }
  ]
}`,
    before_after: `Before/After型コンテンツを作成してください。
日本人がよく使う不自然な英語（Before）と、ネイティブが使う自然な表現（After）を5ペア作成。

JSON形式:
{
  "type": "before_after",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "pairs": [
    { "beforeEn": "不自然英語", "beforeJp": "日本語訳", "afterEn": "自然英語", "afterJp": "日本語訳", "tip": "ポイント解説" }
  ]
}`,
    situation: `シチュエーション型コンテンツを作成してください。
特定の場面で使える会話フレーズとレスポンスを5セット作成。

JSON形式:
{
  "type": "situation",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "situations": [
    { "scene": "場面名", "sceneTitle": "場面タイトル", "phraseEn1": "フレーズ英語", "phraseJp1": "フレーズ日本語", "responseEn": "レスポンス英語", "responseJp": "レスポンス日本語", "point": "ポイント" }
  ]
}`,
    story: `ストーリー型コンテンツを作成してください。
バリ島での実体験風の英語学習エピソードを5スライド分作成。

JSON形式:
{
  "type": "story",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "stories": [
    { "storyTitle": "エピソードタイトル", "storyBody": "本文（100-150文字）" }
  ]
}`,
    student_mistake: `生徒あるある型コンテンツを作成してください。
日本人が英語学習でよくやる間違いを5つ作成。

JSON形式:
{
  "type": "student_mistake",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "mistakes": [
    { "mistakeNumber": "1", "mistakeEn": "間違い英語", "correctEn": "正しい英語", "mistakeExplanation": "解説" }
  ]
}`,
    bali_report: `バリ現地レポ型コンテンツを作成してください。
バリ島の場所・場面で実際に使える英語フレーズを5つ作成。

JSON形式:
{
  "type": "bali_report",
  "title": "タイトル",
  "subtitle": "サブタイトル",
  "reports": [
    { "locationName": "場所名", "phraseEn": "フレーズ英語", "phraseJp": "フレーズ日本語", "usageTip": "使い方のコツ" }
  ]
}`,
  };

  return typeInstructions[templateType] + pastList;
}

// Claude APIレスポンスをContentItemに変換
function parseResponse(templateType: ContentType, raw: unknown, nextId: number): ContentItem {
  const data = raw as Record<string, unknown>;
  const title = (data.title as string) ?? "";
  const subtitle = (data.subtitle as string) ?? "";
  const slides: SlideData[] = [
    { slideNumber: 1, slideType: "cover" },
  ];

  let slideNum = 2;

  switch (templateType) {
    case "list": {
      const phrases = (data.phrases as Record<string, string>[]) ?? [];
      for (const p of phrases) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          phraseEn: p.phraseEn,
          phraseJp: p.phraseJp,
          exampleEn: p.exampleEn,
          exampleJp: p.exampleJp,
        });
      }
      break;
    }
    case "quiz": {
      const quizzes = (data.quizzes as Record<string, string>[]) ?? [];
      for (const q of quizzes) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          questionJp: q.questionJp,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
        });
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          correctOption: q.correctOption,
          answerEn: q.answerEn,
          answerJp: q.answerJp,
          explanation: q.explanation,
        });
      }
      break;
    }
    case "before_after": {
      const pairs = (data.pairs as Record<string, string>[]) ?? [];
      for (const p of pairs) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          beforeEn: p.beforeEn,
          beforeJp: p.beforeJp,
          afterEn: p.afterEn,
          afterJp: p.afterJp,
          tip: p.tip,
        });
      }
      break;
    }
    case "situation": {
      const situations = (data.situations as Record<string, string>[]) ?? [];
      for (const s of situations) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          scene: s.scene,
          sceneTitle: s.sceneTitle,
          phraseEn1: s.phraseEn1,
          phraseJp1: s.phraseJp1,
          responseEn: s.responseEn,
          responseJp: s.responseJp,
          point: s.point,
        });
      }
      break;
    }
    case "story": {
      const stories = (data.stories as Record<string, string>[]) ?? [];
      for (const s of stories) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          storyTitle: s.storyTitle,
          storyBody: s.storyBody,
        });
      }
      break;
    }
    case "student_mistake": {
      const mistakes = (data.mistakes as Record<string, string>[]) ?? [];
      for (const m of mistakes) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          mistakeNumber: m.mistakeNumber,
          mistakeEn: m.mistakeEn,
          correctEn: m.correctEn,
          mistakeExplanation: m.mistakeExplanation,
        });
      }
      break;
    }
    case "bali_report": {
      const reports = (data.reports as Record<string, string>[]) ?? [];
      for (const r of reports) {
        slides.push({
          slideNumber: slideNum++,
          slideType: "content",
          locationName: r.locationName,
          phraseEn1: r.phraseEn,
          phraseJp1: r.phraseJp,
          usageTip: r.usageTip,
        });
      }
      break;
    }
  }

  slides.push({ slideNumber: slideNum, slideType: "cta", leadMagnet: "レベル別英語学習ロードマップ" });

  return { id: nextId, type: templateType, title, subtitle, slides };
}

// キャプション生成
function generateCaption(title: string): string {
  const hashtags = "#英語学習 #英会話 #英語フレーズ #バリ島 #バリ島留学 #英語勉強法 #ネイティブ英語 #留学 #海外生活 #バリリンガル";
  return `${title.replaceAll("\\n", " ")}\n\n保存して何度も見返してね！\n好きな英単語をコメントで教えてね\n毎日使える英語を発信中\n\n${hashtags}`;
}

export async function generateContent(
  apiKey: string,
  db: D1Database,
): Promise<{ content: ContentItem; caption: string }> {
  const client = new Anthropic({ apiKey });

  // ランダムにテンプレート型を選択
  const templateType = TEMPLATE_TYPES[Math.floor(Math.random() * TEMPLATE_TYPES.length)];

  // 過去テーマを取得（重複防止）
  const pastRows = await db
    .prepare("SELECT json_extract(content_json, '$.title') as title FROM generated_content ORDER BY id DESC LIMIT 50")
    .all<{ title: string }>();
  const pastThemes = pastRows.results.map((r) => r.title).filter(Boolean);

  // 次のIDを取得
  const maxIdRow = await db
    .prepare("SELECT COALESCE(MAX(id), 1000) + 1 as next_id FROM generated_content")
    .first<{ next_id: number }>();
  const nextId = maxIdRow?.next_id ?? 1001;

  const prompt = buildPromptForType(templateType, pastThemes);

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

  const raw = JSON.parse(textBlock.text);
  const content = parseResponse(templateType, raw, nextId);
  const caption = generateCaption(content.title);

  // D1に保存
  await db
    .prepare("INSERT INTO generated_content (template_type, content_json, caption, status) VALUES (?, ?, ?, 'pending_review')")
    .bind(templateType, JSON.stringify(content), caption)
    .run();

  return { content, caption };
}
```

- [ ] **Step 3: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 0エラー

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/content-generator.ts ig-auto-poster/src/index.ts
git commit -m "feat(ig-auto-poster): add Claude API content generation module"
```

---

## Task 11: LINEプレビュー・承認モジュール

**Files:**
- Create: `ig-auto-poster/src/line-preview.ts`

- [ ] **Step 1: line-preview.tsを作成**

`ig-auto-poster/src/line-preview.ts`:

```ts
const LINE_API_BASE = "https://api.line.me/v2/bot";

interface LineMessage {
  type: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
  text?: string;
  quickReply?: {
    items: Array<{
      type: "action";
      action: { type: string; label: string; data?: string; text?: string };
    }>;
  };
}

// 画像URLをLINEメッセージ配列に変換（5枚制限を考慮して分割）
function buildPreviewMessages(
  imageUrls: string[],
  contentId: number,
  templateType: string,
  title: string,
): LineMessage[][] {
  const messages: LineMessage[][] = [];
  const batch: LineMessage[] = [];

  for (const url of imageUrls) {
    batch.push({
      type: "image",
      originalContentUrl: url,
      previewImageUrl: url,
    });
  }

  // 5枚ずつ分割
  const firstBatch = batch.slice(0, 5);
  const secondBatch = batch.slice(5);

  if (secondBatch.length > 0) {
    messages.push(firstBatch);
    // 2回目のメッセージに残り画像 + テキスト + クイックリプライ
    const infoMessage: LineMessage = {
      type: "text",
      text: `新しい投稿プレビュー\nテーマ: ${title.replaceAll("\\n", " ")}\nテンプレート: ${templateType}\nスライド数: ${imageUrls.length}枚`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "投稿する", data: `action=approve&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "やり直し", data: `action=regenerate&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "スキップ", data: `action=skip&id=${contentId}` } },
        ],
      },
    };
    secondBatch.push(infoMessage);
    messages.push(secondBatch);
  } else {
    // 5枚以下の場合は1回で送信
    const infoMessage: LineMessage = {
      type: "text",
      text: `新しい投稿プレビュー\nテーマ: ${title.replaceAll("\\n", " ")}\nテンプレート: ${templateType}\nスライド数: ${imageUrls.length}枚`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "投稿する", data: `action=approve&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "やり直し", data: `action=regenerate&id=${contentId}` } },
          { type: "action", action: { type: "postback", label: "スキップ", data: `action=skip&id=${contentId}` } },
        ],
      },
    };
    firstBatch.push(infoMessage);
    messages.push(firstBatch);
  }

  return messages;
}

// LINEプッシュメッセージ送信
async function pushMessages(
  userId: string,
  messages: LineMessage[],
  channelAccessToken: string,
): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

// プレビュー送信（全画像をLINEに送信）
export async function sendPreview(
  imageUrls: string[],
  contentId: number,
  templateType: string,
  title: string,
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  const messageBatches = buildPreviewMessages(imageUrls, contentId, templateType, title);
  for (const batch of messageBatches) {
    await pushMessages(userId, batch, channelAccessToken);
  }
}

// 完了通知
export async function sendNotification(
  text: string,
  userId: string,
  channelAccessToken: string,
): Promise<void> {
  await pushMessages(userId, [{ type: "text", text }], channelAccessToken);
}

// Webhook postbackデータのパース
export function parsePostback(data: string): { action: string; id: number } | null {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const id = params.get("id");
  if (!action || !id) return null;
  return { action, id: parseInt(id, 10) };
}
```

- [ ] **Step 2: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 0エラー

- [ ] **Step 3: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/line-preview.ts
git commit -m "feat(ig-auto-poster): add LINE preview and approval module"
```

---

## Task 12: index.tsの統合（Cron + Webhook + 新フロー）

**Files:**
- Modify: `ig-auto-poster/src/index.ts`
- Modify: `ig-auto-poster/wrangler.toml`

- [ ] **Step 1: wrangler.tomlのCron更新とSecrets追記**

`ig-auto-poster/wrangler.toml` を以下のように更新:

```toml
name = "ig-auto-poster"
main = "src/index.ts"
compatibility_date = "2024-03-01"
compatibility_flags = ["nodejs_compat_v2"]

# Bali time (WITA UTC+8):
# 08:00 (UTC 00:00) - 朝のAI生成+プレビュー送信
# 09:00 (UTC 01:00) - 朝の承認済み投稿
# 16:00 (UTC 08:00) - 午後のAI生成+プレビュー送信
# 18:00 (UTC 10:00) - 午後の承認済み投稿
[triggers]
crons = ["0 0,8 * * *", "0 1,10 * * *"]

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "barilingual-ig-images"

[[d1_databases]]
binding = "DB"
database_name = "ig-auto-poster-db"
database_id = "5d6c137b-4667-4862-a087-5372aebe1e48"

# Secrets (set via `wrangler secret put`):
# - IG_ACCESS_TOKEN
# - IG_BUSINESS_ACCOUNT_ID
# - R2_PUBLIC_URL (e.g. https://images.barilingual.com)
# - ANTHROPIC_API_KEY
# - LINE_CHANNEL_ACCESS_TOKEN
# - LINE_OWNER_USER_ID
```

- [ ] **Step 2: index.tsを全面書き換え**

`ig-auto-poster/src/index.ts`:

```ts
import { generateSlideImages } from "./image-generator";
import { publishCarousel } from "./instagram";
import { getCaption } from "./captions";
import { allContent } from "./content-data";
import { generateContent } from "./content-generator";
import { sendPreview, sendNotification, parsePostback } from "./line-preview";
import type { ContentItem } from "./content-data";

export interface Env {
  IMAGES: R2Bucket;
  DB: D1Database;
  IG_ACCESS_TOKEN: string;
  IG_BUSINESS_ACCOUNT_ID: string;
  R2_PUBLIC_URL: string;
  ANTHROPIC_API_KEY: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_OWNER_USER_ID: string;
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

// --- 画像生成+R2保存 ---
async function generateAndStoreImages(
  content: ContentItem,
  env: Env,
  prefix: string,
): Promise<string[]> {
  const slideImages = await generateSlideImages(content);
  const imageUrls: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < slideImages.length; i++) {
    const key = `${prefix}/${timestamp}/slide-${i + 1}.png`;
    await env.IMAGES.put(key, slideImages[i], {
      httpMetadata: { contentType: "image/png" },
    });
    imageUrls.push(`${env.R2_PUBLIC_URL}/${key}`);
  }
  return imageUrls;
}

// --- Cronハンドラー ---
// 生成Cron (UTC 0:00, 8:00): AI生成 → プレビュー送信
async function handleGenerateCron(env: Env): Promise<void> {
  const { content, caption } = await generateContent(env.ANTHROPIC_API_KEY, env.DB);
  const imageUrls = await generateAndStoreImages(content, env, "preview");

  // D1に画像URLを保存
  await env.DB
    .prepare("UPDATE generated_content SET content_json = ? WHERE id = (SELECT MAX(id) FROM generated_content)")
    .bind(JSON.stringify({ ...content, imageUrls, caption }))
    .run();

  await sendPreview(
    imageUrls,
    content.id,
    content.type,
    content.title,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`Preview sent for: ${content.title}`);
}

// 投稿Cron (UTC 1:00, 10:00): 承認済みコンテンツを投稿
async function handlePostCron(env: Env): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, content_json, caption FROM generated_content WHERE status = 'approved' ORDER BY id ASC LIMIT 1")
    .first<{ id: number; content_json: string; caption: string }>();

  if (!row) {
    // 承認済みがない場合、フォールバックとして既存データを投稿
    console.log("No approved content. Using fallback from content-data.ts");
    const contentIndex = await getContentIndex(env.DB);
    const content = allContent[contentIndex % allContent.length];
    const imageUrls = await generateAndStoreImages(content, env, "auto");
    const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);
    await publishCarousel(imageUrls, caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);
    await updateContentIndex(env.DB, (contentIndex + 1) % allContent.length);
    console.log(`Fallback posted: ${content.title}`);
    return;
  }

  const stored = JSON.parse(row.content_json) as ContentItem & { imageUrls: string[]; caption: string };
  await publishCarousel(stored.imageUrls, row.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID);

  await env.DB
    .prepare("UPDATE generated_content SET status = 'posted', posted_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  await sendNotification(
    `投稿完了: ${stored.title.replaceAll("\\n", " ")}`,
    env.LINE_OWNER_USER_ID,
    env.LINE_CHANNEL_ACCESS_TOKEN,
  );
  console.log(`Posted: ${stored.title}`);
}

// --- LINE Webhookハンドラー ---
interface LineWebhookEvent {
  type: string;
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
        // 再生成
        await handleGenerateCron(env);
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

// --- 既存プレビューAPI（後方互換） ---
interface PreviewResult {
  contentIndex: number;
  content: { id: number; type: string; title: string; subtitle: string };
  caption: string;
  imageUrls: string[];
}

async function generatePreview(env: Env, indexOverride?: number): Promise<PreviewResult> {
  const contentIndex = indexOverride ?? await getContentIndex(env.DB);
  const content = allContent[contentIndex % allContent.length];
  const imageUrls = await generateAndStoreImages(content, env, "preview");
  const caption = getCaption(content.title.replaceAll("\n", " "), contentIndex);

  return {
    contentIndex,
    content: { id: content.id, type: content.type, title: content.title, subtitle: content.subtitle },
    caption,
    imageUrls,
  };
}

// --- メインエクスポート ---
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const hour = new Date(controller.scheduledTime).getUTCHours();

    if (hour === 0 || hour === 8) {
      // 生成 + プレビュー送信
      await handleGenerateCron(env);
    } else if (hour === 1 || hour === 10) {
      // 承認済みの投稿
      await handlePostCron(env);
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

    try {
      // LINE Webhook
      if (request.method === "POST" && url.pathname === "/line-webhook") {
        return handleLineWebhook(request, env);
      }

      // GET /status
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
        return json({
          contentIndex: index,
          totalContent: allContent.length,
          nextContent: allContent[index % allContent.length].title.replaceAll("\n", " "),
          lastPostedAt: row?.last_posted_at,
          pendingReview: pendingCount?.count ?? 0,
          approved: approvedCount?.count ?? 0,
        });
      }

      // POST /preview - 既存データのプレビュー（後方互換）
      if (request.method === "POST" && url.pathname === "/preview") {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const indexOverride = typeof body.index === "number" ? body.index : undefined;
        const preview = await generatePreview(env, indexOverride);
        return json({ success: true, ...preview });
      }

      // POST /generate - AI生成+プレビュー送信（手動トリガー）
      if (request.method === "POST" && url.pathname === "/generate") {
        await handleGenerateCron(env);
        return json({ success: true, message: "Content generated and preview sent to LINE" });
      }

      // POST /publish - 手動投稿
      if (request.method === "POST" && url.pathname === "/publish") {
        const body = await request.json() as {
          imageUrls: string[];
          caption: string;
          contentIndex: number;
        };
        if (!body.imageUrls || !body.caption) {
          return json({ error: "imageUrls and caption are required." }, 400);
        }
        const publishedId = await publishCarousel(
          body.imageUrls, body.caption, env.IG_ACCESS_TOKEN, env.IG_BUSINESS_ACCOUNT_ID,
        );
        const nextIndex = (body.contentIndex + 1) % allContent.length;
        await updateContentIndex(env.DB, nextIndex);
        return json({ success: true, id: publishedId });
      }

      // GET /images/*
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

      // GET /content
      if (request.method === "GET" && url.pathname === "/content") {
        const list = allContent.map((c) => ({
          id: c.id, type: c.type, title: c.title.replaceAll("\n", " "),
        }));
        return json({ total: list.length, content: list });
      }

      return json({
        endpoints: [
          "GET  /status       - 現在の状態",
          "GET  /content      - 既存ネタリスト",
          "POST /preview      - 既存データでプレビュー生成",
          "POST /generate     - AI生成+LINEプレビュー送信",
          "POST /publish      - 手動投稿",
          "POST /line-webhook - LINE Webhook",
        ],
      }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ success: false, error: message }, 500);
    }
  },
};
```

- [ ] **Step 3: typecheckを実行**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 0エラー

- [ ] **Step 4: コミット**

```bash
cd /Users/kimuratakuya/line-harness
git add ig-auto-poster/src/index.ts ig-auto-poster/wrangler.toml
git commit -m "feat(ig-auto-poster): integrate Cron flow, LINE webhook, and AI generation into index.ts"
```

---

## Task 13: エンドツーエンド動作検証

**Files:** なし（検証のみ）

- [ ] **Step 1: ローカル起動**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm dev
```

- [ ] **Step 2: 既存プレビューAPIの後方互換確認**

```bash
curl -X POST http://localhost:8787/preview -H 'Content-Type: application/json' -d '{"index": 0}'
```

Expected: 既存と同じレスポンス形式。imageUrlsに画像URLが含まれる。

- [ ] **Step 3: ステータスAPI確認**

```bash
curl http://localhost:8787/status
```

Expected: `pendingReview`と`approved`フィールドが追加されている。

- [ ] **Step 4: 全テンプレート型で画像品質を確認**

各テンプレート型の画像をブラウザで開き、レイアウト崩れがないことを視覚的に確認。特に:
- 長いテキストの折り返し
- 日英混在テキスト
- ボトムバーとの重なりなし

- [ ] **Step 5: typecheckが通ることを最終確認**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm typecheck
```

Expected: 0エラー

---

## Task 14: リモートD1マイグレーション・Secrets設定・デプロイ

**Files:** なし（インフラ操作のみ）

- [ ] **Step 1: リモートD1にマイグレーション適用**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm migrate
```

Expected: `Successfully applied migration 0002_generated_content.sql`

- [ ] **Step 2: Secrets設定**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
echo "設定するSecrets:"
echo "  wrangler secret put ANTHROPIC_API_KEY"
echo "  wrangler secret put LINE_CHANNEL_ACCESS_TOKEN"
echo "  wrangler secret put LINE_OWNER_USER_ID"
```

ユーザーに各値を入力してもらう。LINE_OWNER_USER_IDはLINE Developersコンソールから取得。

- [ ] **Step 3: デプロイ**

```bash
cd /Users/kimuratakuya/line-harness/ig-auto-poster
pnpm deploy
```

Expected: `Published ig-auto-poster`

- [ ] **Step 4: 本番で/generate APIをテスト**

```bash
curl -X POST https://ig-auto-poster.<account>.workers.dev/generate
```

Expected: AI生成が実行され、LINEにプレビュー画像が届く。

- [ ] **Step 5: LINEでプレビューを確認し「投稿する」をタップ**

LINEでクイックリプライの「投稿する」をタップし、次の投稿Cronで自動投稿されることを確認。

- [ ] **Step 6: 最終コミット（もし修正があれば）**

```bash
cd /Users/kimuratakuya/line-harness
git add -A ig-auto-poster/
git commit -m "fix(ig-auto-poster): post-deploy adjustments"
git push
```
