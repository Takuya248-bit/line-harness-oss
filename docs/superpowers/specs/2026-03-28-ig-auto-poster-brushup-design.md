# ig-auto-poster ブラッシュアップ設計書

## 概要

バリリンガルのInstagram自動投稿システム(ig-auto-poster)を以下3軸で改善する:

1. 画像レイアウトの堅牢化（Satori移行）
2. AIコンテンツ自動生成（Claude API）
3. LINEプレビュー承認フロー

## 課題

- テキスト折り返しが文字数ベースで、実ピクセル幅を考慮しておらず日英混在でレイアウト崩れ
- 7テンプレート関数がそれぞれ個別にY座標計算・折り返し処理を持ち、ロジック散在（800行超）
- テキスト長が想定超えるとカード・ボトムバーと重なる（オーバーフロー対策なし）
- コンテンツ60本がcontent-data.tsにハードコード（1027行）

## アーキテクチャ

```
Cron発火
  ↓
Claude API → コンテンツ生成（テーマ・テキスト・スライド構成）
  ↓
Satori → JSXテンプレート → SVG生成（Flexboxレイアウト）
  ↓
resvg-wasm → SVG → PNG変換（既存パイプライン流用）
  ↓
R2 → 画像保存
  ↓
LINE Messaging API → プレビュー画像をLINEに全枚送信
  ↓
ユーザー承認（LINEクイックリプライ）
  ↓
Instagram Graph API → カルーセル投稿
```

## セクション1: Satoriテンプレートシステム

### ディレクトリ構成

```
src/
  templates/
    base.tsx        -- 共通レイアウト（背景、ボトムバー、装飾）
    cover.tsx       -- 表紙スライド
    cta.tsx         -- CTAスライド
    list-slide.tsx  -- リスト型
    quiz-question.tsx
    quiz-answer.tsx
    before-after.tsx
    situation.tsx
    story.tsx       -- ストーリー型
    student.tsx     -- 生徒あるある型
    bali-report.tsx -- バリレポ型
  image-generator.ts -- Satori呼び出し + resvg変換のみ（薄いラッパー）
```

### テンプレートの書き方（例: Before/After）

```tsx
export function BeforeAfterSlide(props: SlideData) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350 }}>
      <div style={{ flex: 1, padding: 40, background: 'linear-gradient(...)' }}>
        <span style={{ fontSize: 56, color: '#616161', wordBreak: 'break-word' }}>
          {props.beforeEn}
        </span>
      </div>
      <div style={{ flex: 1, padding: 40, background: 'linear-gradient(...)' }}>
        <span style={{ fontSize: 56, fontWeight: 700, wordBreak: 'break-word' }}>
          {props.afterEn}
        </span>
      </div>
      <BottomBar />
    </div>
  )
}
```

### 解決すること

- テキスト折り返し: Satoriが`wordBreak: 'break-word'`でピクセル単位の折り返しを自動処理。wrapText()関数は不要に
- オーバーフロー: `overflow: 'hidden'`やフォントサイズ自動縮小で、はみ出し防止
- テンプレート追加: 新しいTSXファイルを1つ追加するだけ。レイアウトはCSS Flexboxで直感的に書ける
- コード量: 800行超 → テンプレートあたり30-50行に削減

### image-generator.tsの役割変更

```ts
import satori from 'satori'

async function renderSlide(element: JSX.Element): Promise<Uint8Array> {
  const svg = await satori(element, {
    width: 1080, height: 1350,
    fonts: [{ name: 'Zen Maru Gothic', data: fontData, weight: 700 }]
  })
  return renderSvgToPng(svg) // 既存のresvgパイプライン流用
}
```

## セクション2: AIコンテンツ生成パイプライン

### 生成フロー

```
Cron発火(毎日 バリ時間8:00, 16:00)
  ↓
D1から投稿済みテーマを取得（重複防止）
  ↓
Claude API (Haiku 3.5) にプロンプト送信
  - テンプレート型をランダム選択
  - 過去テーマのリストを渡して重複回避
  - バリリンガルのトーン&ターゲット（日本人英語学習者）を指示
  ↓
構造化レスポンス（JSON）で受け取り
  ↓
D1にコンテンツ保存（status: 'pending_review'）
```

### D1スキーマ追加

```sql
CREATE TABLE generated_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  caption TEXT NOT NULL,
  status TEXT DEFAULT 'pending_review',
  created_at TEXT DEFAULT (datetime('now')),
  posted_at TEXT
);
```

### 既存データとの共存

- 既存60本のcontent-data.tsはそのまま残す（移行不要）
- 新規コンテンツはAI生成 → D1保存
- 投稿時にD1の未投稿分を優先、なければ既存データからローテーション

### コスト

- Claude Haiku 3.5: 入力$0.80/MTok, 出力$4/MTok
- 1投稿あたり ~$0.005、月60投稿で ~$0.30

## セクション3: LINEプレビュー・承認フロー

### フロー

```
コンテンツ生成完了
  ↓
Satori → resvg → PNG画像生成（カルーセル全枚）
  ↓
R2に保存（status: preview）
  ↓
LINE Messaging APIでプレビュー送信
  - メッセージ1: 画像5枚（カバー + スライド1-4）
  - メッセージ2: 画像2枚（スライド5 + CTA）+ テキスト + クイックリプライ
  ↓
ユーザーがLINEで操作
  ├── 「投稿する」→ Instagram投稿実行 → 完了通知
  ├── 「やり直し」→ 同テーマで再生成 → 再プレビュー
  └── 「スキップ」→ status: skipped → 次のコンテンツへ
```

### 必要な設定

- Secrets追加: LINE_CHANNEL_ACCESS_TOKEN, LINE_OWNER_USER_ID
- Webhook URL: /line-webhook エンドポイント追加

### タイムライン（1日の流れ）

```
00:00 UTC (バリ時間8:00) → AI生成 → プレビュー送信
  ↓ LINEで確認・承認
01:00 UTC (バリ時間9:00) → 承認済みなら自動投稿

08:00 UTC (バリ時間16:00) → AI生成 → プレビュー送信
  ↓ LINEで確認・承認
10:00 UTC (バリ時間18:00) → 承認済みなら自動投稿
```

### 未承認時の挙動

承認なく投稿時刻を迎えた場合は投稿しない（安全側）。設定により既存content-data.tsからフォールバック投稿も可能。

### メッセージ通数

- 1投稿あたり2通（画像5枚 + 画像2枚+テキスト+クイックリプライ）
- 月60投稿 x 2通 = 120通/月（30,000通プランで余裕）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| package.json | satori, @anthropic-ai/sdk 追加 |
| src/image-generator.ts | SVGベタ書き → Satori呼び出しラッパーに書き換え |
| src/templates/*.tsx (新規) | 各テンプレートをJSX + Flexboxで実装 |
| src/content-generator.ts (新規) | Claude API連携コンテンツ生成 |
| src/line-preview.ts (新規) | LINEプレビュー送信・承認管理 |
| src/index.ts | /line-webhook追加、Cronフロー変更 |
| src/content-data.ts | 変更なし（既存データ維持） |
| src/instagram.ts | 変更なし |
| src/captions.ts | AI生成キャプションに段階的移行（既存も残す） |
| migrations/0002_generated_content.sql (新規) | generated_contentテーブル追加 |
| wrangler.toml | Secrets追加 |

## スコープ外（今回やらないこと）

- Instagram分析・ABテスト（将来フェーズ）
- 管理画面Web UI（LINEで十分）
- Reels/動画対応（将来フェーズ）
- 既存60本のD1移行（ハードコードのまま共存）

## コスト影響

| 項目 | 月額 |
|------|------|
| Claude API (Haiku 3.5, 60投稿) | ~$0.30 |
| Satori (OSS) | $0 |
| LINE (既存30,000通プランの枠内) | $0 |
| Cloudflare Workers/D1/R2 | 既存無料枠内 |
| 合計追加コスト | ~$0.30/月 |

## リスク・注意点

- Satori + Workers互換性: satori-wasmパッケージでWorkers対応を検証する必要あり。不可の場合はSVGレイアウトエンジン統一（アプローチA）にフォールバック
- LINE Webhook: バリリンガルの既存LINE設定には絶対に触れない（feedbackルール遵守）。プレビュー送信にはバリリンガルのMessaging APIを使うが、Webhook URLは専用エンドポイント(/line-webhook)を新設。既存Webhookが設定されている場合は、実装前にユーザー確認必須
- フォント: 現在GitHubから毎回fetchしている。R2にキャッシュして高速化する改善も含める
