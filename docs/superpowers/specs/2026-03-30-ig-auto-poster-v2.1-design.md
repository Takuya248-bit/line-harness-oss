# IG Auto Poster v2.1 - バリ島情報カルーセル + エンゲージメント最適化

## 概要

ig-auto-posterを英語学習カルーセルからバリ島情報系カルーセルに全面転換し、エンゲージメント計測+カテゴリ自動最適化レイヤーを追加する。

## 背景

- 既存v2設計書（2026-03-28）でバリ島情報への転換は設計済み。Task 1,3,4,5,6は実装済み
- 本設計はv2に「計測→最適化ループ」を追加するv2.1
- コンテンツの1次情報ソースはネットリサーチ（knowledge-collector経由）

## v2からの変更点

1. コンテンツ生成: Claude API単体 → 知識DB（事前リサーチ済み）+ Haiku整形
2. 承認フロー: Webギャラリー常時 → Phase 1承認 / Phase 2全自動
3. 新規追加: IG Insights計測 + カテゴリ比率自動最適化 + LINE週次レポート

## アーキテクチャ

```
[knowledge-collector] 週次cron
  → バリ情報ソース巡回 → Haiku事実抽出 → POST /api/knowledge
         ↓
[知識DB (D1)] locale/method/case等のカテゴリで蓄積
         ↓
[content-generator-v2] 日次cron (1日2回)
  → 知識DBからカテゴリ比率に応じてネタ選定
  → Haiku でキャッチコピー+紹介文を整形
  → Unsplash APIで写真取得
  → Satori+resvg-wasmで10枚カルーセル生成
         ↓
[承認フロー]
  Phase 1 (初期2週間): Webギャラリーで承認
  Phase 2 (安定後): auto_approveフラグONで全自動
         ↓
[Instagram Graph API] カルーセル投稿
         ↓
[insights-collector] 週次cron
  → IG Insights APIで直近7日の投稿メトリクス取得
  → カテゴリ別保存数を集計 → D1保存
         ↓
[category-optimizer] insights-collector直後に実行
  → カテゴリ別スコア算出 → 生成比率更新
  → LINE週次レポート通知
```

## コンテンツ戦略

### カテゴリ構成

| カテゴリID | 内容 | 初期比率 | 知識DBカテゴリ |
|-----------|------|---------|---------------|
| cafe | カフェ・コーヒーショップ | 20% | locale:bali_cafe |
| spot | 絶景・観光スポット | 15% | locale:bali_area |
| food | ローカルフード・ワルン | 15% | locale:bali_food |
| beach | ビーチ・海 | 10% | locale:bali_area |
| lifestyle | 移住・暮らしのリアル | 10% | locale:bali_cost, case |
| cost | 物価・コスト情報 | 10% | locale:bali_cost |
| visa | ビザ・手続き | 10% | regulation:bali_visa |
| culture | 文化・お祭り・儀式 | 10% | locale:bali_culture |

### 投稿構成（10枚カルーセル）

v2設計書（2026-03-28）のデザイン仕様をそのまま踏襲:
1. カバー: 写真全面 + キャッチコピー + Balilingualロゴ
2-6. 各スポット/アイテム: 写真全面 + 番号バッジ + 名前 + 紹介文
7. まとめ/MAP
8. CTA: 「保存してバリ旅行の参考に」

### キャプション構成

- タイトル + 各スポット一言紹介 + CTA + ハッシュタグ10個（動的生成）
- Unsplash帰属表示: 「Photo by X on Unsplash」をキャプション末尾に

## コンテンツソース: knowledge-collector拡張

### 追加するバリ情報ソース

既存14URLに加え、バリ島情報ソースを追加:

| ソース種別 | 例 | 頻度 |
|-----------|---|------|
| バリ島旅行ブログ（日本語） | バリ島ナビ、バリ倶楽部等 | 週1 |
| 英語圏バリ情報 | The Bali Bible, Bali.com等 | 週1 |
| Google Maps人気スポット | エリア別トップスポット | 週1 |
| TripAdvisor/Klook | レビュー高評価スポット | 週1 |

### 収集→投稿の流れ

1. knowledge-collector がURL巡回 → Haikuで事実抽出 → POST /api/knowledge
2. content-generator-v2 がGET /api/knowledge?category=locale で取得
3. カテゴリ比率テーブル（category_weights）に従いネタ選定
4. 同じスポットの重複投稿はposted_topics テーブルで回避

## DB設計

### 新規テーブル

```sql
-- カテゴリ別生成比率
CREATE TABLE IF NOT EXISTS category_weights (
  category TEXT PRIMARY KEY,
  weight REAL NOT NULL DEFAULT 0.125,
  avg_saves REAL DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
-- auto_approve: 'false' (Phase 1) → 'true' (Phase 2)
```

### 既存テーブル変更

- generated_content: categoryカラム追加（投稿のカテゴリを記録）
- posted_topics: v2プランで作成済み（Task 1完了）

## エンゲージメント計測

### IG Insights API

```
GET /{media_id}/insights?metric=saved,likes,comments,reach
```

- アクセス: IG_ACCESS_TOKENで認証（既存トークン流用）
- 制限: 1メディアあたり1リクエスト。1日200リクエストまで（十分）
- 取得タイミング: 投稿後7日経過した投稿を対象（数値安定化のため）

### 週次計測Cron

- 毎週月曜 UTC 2:00（バリ時間10:00）
- 処理: 直近7日でstatus='posted'かつ投稿後7日以上経過した投稿のInsightsを取得
- post_performanceテーブルに保存

## カテゴリ自動最適化

### スコア算出

```
カテゴリスコア = カテゴリ別の平均保存数
```

### 比率更新ロジック

1. 全カテゴリのスコアを算出
2. 上位3カテゴリ: weight += 0.05
3. 下位2カテゴリ: weight -= 0.05
4. 制約: 最低5%（0.05）、最大30%（0.30）
5. 全体を正規化して合計1.0にする
6. category_weightsテーブルを更新

### 最小投稿数ガード

- カテゴリの投稿数が3件未満の場合、最適化対象外（初期比率を維持）
- 全カテゴリが3件以上になるまでは均等配分

## 承認フロー

### Phase 1（初期2週間）

- ig_settings.auto_approve = 'false'
- Cron生成後、Webギャラリー（/gallery）にプレビュー表示
- /gallery/:id で全スライド確認 → 承認/スキップ
- LINEには「新しい投稿が生成されました。ギャラリーで確認してください」と通知
- 承認済みのみ次のPost Cronで投稿

### Phase 2（安定後）

- ig_settings.auto_approve = 'true'（手動で切替 or 2週間後に自動切替）
- 生成→即approved→次のPost Cronで投稿
- LINEには投稿完了通知のみ

### Webギャラリー

- GET /gallery: 生成済みコンテンツ一覧（ステータスフィルタ: pending/approved/posted/skipped）
- GET /gallery/:id: 全10スライドプレビュー + 承認/スキップボタン
- HTMLレスポンス（Workers内でSSR）。外部フレームワーク不要

## LINE週次レポート

insights-collector完了後にLINE通知:

```
IG週次レポート (3/24〜3/30)

カテゴリ別保存数ランキング:
1. cafe: 平均82保存 (↑)
2. food: 平均65保存 (→)
3. spot: 平均58保存 (↑)
...

次週の生成比率:
cafe 25% / food 15% / spot 20% / ...

総投稿数: 14本
総保存数: 892
総リーチ: 12,340
```

## コスト見積もり

| 項目 | 月額 |
|------|------|
| knowledge-collector (Haiku) | ~$1 |
| content-generator テキスト整形 (Haiku) | ~$0.06 |
| Unsplash API | $0 (無料枠) |
| IG Insights API | $0 |
| Cloudflare Workers | $0 (無料枠内想定) |
| R2 ストレージ | $0 (無料枠内) |
| 合計 | ~$1/月 |

※ Workers CPU超過時: $5/月の有料プラン移行が必要になる可能性あり

## IG Access Token 管理

- 現状: 手動設定、60日で失効（推定期限: 2026-05-27）
- 本設計では自動更新は対象外（別途対応）
- 5月中旬にLINEリマインダーを設定する（knowledge-collector or 別Cron）

## 既存コードの扱い

- content-data.ts（英語学習60本）: フォールバックとして残す
- 既存テンプレート（7種）: 当面残す
- v2テンプレート（bali-cover/bali-spot/bali-cta等）: v2プランのTask 3-5で作成済み
- content-generator.ts: 既存AI生成ロジック → content-generator-v2.tsに置換

## ファイル構成（変更/新規のみ）

```
ig-auto-poster/src/
├── index.ts                    # 変更: gallery/insightsルート追加、Cron分岐追加
├── content-generator-v2.ts     # 変更: 知識DB+比率ベース生成に改修
├── unsplash.ts                 # 新規(v2プランTask 2、未実装): Unsplash API写真取得
├── insights.ts                 # 新規: IG Insights API取得
├── optimizer.ts                # 新規: カテゴリ比率最適化ロジック
├── gallery.ts                  # 新規: WebギャラリーHTML生成
├── templates/
│   ├── bali-cover.ts           # 既存(v2で作成済み): 変更なし
│   ├── bali-spot.ts            # 既存(v2で作成済み): 変更なし
│   └── bali-cta.ts             # 既存(v2で作成済み): 変更なし
└── migrations/
    ├── 0003_posted_topics.sql  # 既存(v2で作成済み)
    └── 0006_v2.1.sql           # 新規: category_weights, post_performance, ig_settings

knowledge-collector/
└── sources/                    # 変更: バリ情報ソースURLを追加
```

## 成功指標

- 保存数: 投稿あたり平均50保存以上
- 最適化効果: 4週間後にトップカテゴリの保存数が初期比+30%
- 運用コスト: 月$1.5以下を維持
- 承認→全自動切替: 2週間以内
