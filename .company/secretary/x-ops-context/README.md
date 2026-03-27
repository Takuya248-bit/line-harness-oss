# LINE Harness X運用コンテキスト集約

このフォルダは、LINE HarnessのX運用開始に必要な関連資料をコピーして集約したものです。
元データは移動せず、コピーのみを配置しています。

## 構成

- `code/`
  - `x-posts.ts`: X投稿APIルート（CRUD/生成/投稿）
  - `x-posting.ts`: Cron投稿処理・BAN対策ロジック
  - `x-content-generator.ts`: テンプレ/AI投稿文生成ロジック
  - `x-api.ts`: X APIクライアント（OAuth 1.0a）
  - `010_x_posts.sql`: X投稿関連テーブルDDL

- `scripts/`
  - `generate-x-post-images.mjs`: 投稿画像生成スクリプト
  - `generate-x-profile-images.mjs`: プロフィール画像生成スクリプト

- `assets/`
  - X投稿用画像5枚 + プロフィール画像2枚

- `strategy/`
  - `coconala-listings-final.md`: 販売訴求・価格設計の原稿
  - `line-harness-construction-service.md`: サービス戦略メモ
  - `line-harness-seo-keywords.md`: SEOキーワード調査

## 目的

X運用で必要な以下を1か所で参照できるようにするため:

1. 投稿実行基盤（API/Cron/DB）
2. 投稿素材生成（画像・文面）
3. 収益導線（ココナラ/LINE）と訴求軸
