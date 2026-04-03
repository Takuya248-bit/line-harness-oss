# IG V2画像パイプライン改善 設計書

## 背景

V2パイプライン（Satori + Pexels写真背景）でIG投稿画像を生成しているが、以下の品質問題がある:

1. LLMが架空カフェ名を生成（カフェアウリア、カフェモカ等）
2. Pexelsで架空名を検索するため写真が内容と不一致
3. まとめ・CTAページがグラデーション背景でデザイン不統一
4. V1残骸（slide 9-10）が文字化けしたまま残存
5. スポットページに詳細情報がない

## 設計方針

- 実在スポットデータをFoursquare API（無料枠）から自動収集
- まずカフェカテゴリで検証、成功後に他カテゴリ展開
- 情報密度・デザインともにA/Bテストで最適解を探る
- コスト: 完全0円（Foursquare Pro無料枠 + Pexels無料 + Groq無料）

## 変更一覧

### 1. Foursquare Place Search連携

新規ファイル: `ig-auto-poster/src/pipeline/spot-collector.ts`

- Foursquare Place Search API（Proフィールド、無料）
- クエリ: カテゴリ=cafe、座標=バリ島中心(-8.65, 115.22)、半径=30km
- 取得フィールド: name, location, categories, website（Pro無料枠内）
- 初回50件、以降週次で10件追加
- FOURSQUARE_API_KEY環境変数を追加

### 2. real_spotsテーブル

D1に新テーブル追加:

```sql
CREATE TABLE real_spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'cafe',
  latitude REAL,
  longitude REAL,
  website TEXT,
  foursquare_id TEXT UNIQUE,
  price_level TEXT,
  description TEXT,
  used_count INTEGER DEFAULT 0,
  fetched_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- foursquare_idで重複チェック
- used_countで使用頻度トラッキング（同じ店の連続使用を防止）
- price_level, descriptionはLLMが補完

### 3. コンテンツ生成の変更

対象: `content-planner.ts`, `weekly.ts`

現状:
- LLMに「バリ島のカフェを5件考えて」と指示 → 架空名生成

変更後:
- real_spotsテーブルからused_count昇順で5件取得
- LLMには実在スポットデータを渡し「紹介文のみ」生成させる
- LLMプロンプトで価格帯・おすすめポイントも補完

### 4. スポット情報量のA/Bテスト

3バリアント:

- simple: 店名 + エリア + 一言説明
- rich: 店名 + エリア + 価格帯 + おすすめポイント
- practical: 店名 + エリア + 営業時間 + 価格帯 + おすすめメニュー

テンプレートを3種用意し、ab_testsテーブルに `test_axis: "info_density"` として追加。
既存のA/Bテスト基盤（manager.ts, reporter.ts）をそのまま活用。

### 5. デザイン統一のA/Bテスト

2バリアント:

- photo_unified: 全スライド（まとめ・CTA含む）写真背景
- gradient_mixed: スポットは写真、まとめ・CTAはグラデーション（現状）

既存の `test_axis: "design"` を拡張。
まとめ・CTA用のテンプレートに写真背景バリアントを追加。

### 6. Pexels検索改善

対象: `image-fetcher.ts`

- 実在店名ベースで検索: `{店名} bali cafe`
- ヒットしない場合のフォールバック順:
  1. `{エリア名} bali cafe`
  2. `bali cafe interior`
  3. `bali coffee shop`
- カバー写真は現状維持（`bali {category}` で十分な品質）

### 7. R2残骸削除

対象: `weekly.ts`, 必要なら `r2-upload.ts`

- V2アップロード前に `v4/{week}/{postIndex}/` 配下の既存オブジェクトをリスト→全削除
- V2は8枚固定のため、slide-9, slide-10等の残骸が残らない

### 8. フォント検証・修正

対象: `satori-renderer.ts`

- GH Actions環境（Ubuntu）で `assets/fonts/ZenMaruGothic-Bold.ttf` が正しく読み込まれるか確認
- フォントファイルがリポジトリに含まれているか確認、なければコミット
- Satoriのfontオプションにフォールバックフォント追加

## スライド構成（8枚固定）

1. カバー: 写真背景 + タイトル + 数字バッジ（現状維持）
2-6. スポット1-5: 写真背景 + 実在スポット情報（A/Bテストで密度変動）
7. まとめ: 5件リスト（A/Bテストでデザイン変動）
8. CTA: LINE誘導（A/Bテストでデザイン変動）

## 環境変数追加

- FOURSQUARE_API_KEY: GH Secretsに追加

## コスト見積もり

| サービス | 月間使用量 | 費用 |
|---------|-----------|------|
| Foursquare Pro | ~140コール | 無料（10,000コール/月） |
| Pexels | ~200コール | 無料 |
| Groq | ~50コール | 無料 |
| Cloudflare D1 | 微量追加 | 無料枠内 |

合計: 0円/月

## スコープ外

- カフェ以外のカテゴリ自動収集（成功後に展開）
- Foursquare Premium機能（写真・評価の直接取得）
- Google Maps API連携
