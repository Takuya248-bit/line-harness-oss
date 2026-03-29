# 知識DB v2: カテゴリ再設計 + 二次情報自動収集

## 概要

知識DBのカテゴリを事業別→知識の性質別に再設計し、権威ソースからの二次情報自動収集を追加する。

## カテゴリ体系（8カテゴリ）

| category | 何の知識か | subcategory例 |
|----------|-----------|---------------|
| market | 市場・統計・トレンド・業界動向 | study_abroad, line_market, ai_market, sns_trend |
| technology | 技術・ツール・API・PF仕様 | line_api, cloudflare, llm, lstep, playwright |
| method | ノウハウ・手法・ベストプラクティス | seo, line_automation, content_creation, lstep_config |
| case | 事例・実績・Before/After | barilingual_student, lcustom_client, competitor |
| locale | 地域・生活・文化・制度 | bali_area, bali_visa, bali_cost, bali_cafe |
| people | 顧客の声・FAQ・行動パターン | barilingual_student, lcustom_client, common_worry |
| ai_news | AI・LLM・自動化の最新動向 | model_release, api_pricing, use_case, regulation |
| regulation | 法律・規制・ガイドライン | tokushoho, keihin, privacy, platform_tos |

## 変更点（v1→v2）

| v1 category | v2 category | 理由 |
|-------------|-------------|------|
| bali_area | locale | 地域情報は汎用カテゴリに |
| study_faq | people | 顧客の声・FAQとして統合 |
| barilingual | case + people | 事例と顧客の声に分離 |
| english_learning | method | ノウハウとして統合 |
| evidence | case | 事例カテゴリに統合 |
| lstep | method + technology | 手法と技術仕様に分離 |
| line_official | technology | 技術仕様として統合 |
| lcustom | case + method | 事例と手法に分離 |
| seo | method | 手法として統合 |
| tech | technology | 統合 |
| marketing | method + market | 手法と市場に分離 |
| business | market | 市場に統合 |
| (新規) | ai_news | AI動向を独立カテゴリに |
| (新規) | regulation | 法規制を独立カテゴリに |

## 二次情報自動収集システム

### アーキテクチャ

```
定点観測URLリスト（watchlist.json）
  ↓ 週次cron（GH Actions）
URLごとにfetch → Haiku で事実・数字を抽出
  ↓
既存エントリと差分チェック（重複防止）
  ↓
POST /api/knowledge（source: research, reliability: unverified, ソースURL付き）
```

### 定点観測URLリスト

```json
[
  {
    "url": "https://www.linebiz.com/jp/news/",
    "category": "technology",
    "subcategory": "line_api",
    "extract": "LINE公式アカウントの新機能・料金変更・仕様変更"
  },
  {
    "url": "https://developers.line.biz/ja/news/",
    "category": "technology",
    "subcategory": "line_api",
    "extract": "Messaging APIの変更点・新機能"
  },
  {
    "url": "https://blog.google/technology/ai/",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "Google AI/Geminiの新モデル・機能リリース"
  },
  {
    "url": "https://www.anthropic.com/news",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "Claude/Anthropicの新モデル・API変更・料金"
  },
  {
    "url": "https://openai.com/blog",
    "category": "ai_news",
    "subcategory": "model_release",
    "extract": "OpenAI/GPTの新モデル・機能・料金"
  },
  {
    "url": "https://developers.googleblog.com/en/search/",
    "category": "method",
    "subcategory": "seo",
    "extract": "Google検索アルゴリズム変更・SEOガイドライン"
  },
  {
    "url": "https://about.instagram.com/blog",
    "category": "market",
    "subcategory": "sns_trend",
    "extract": "Instagram機能変更・アルゴリズム・トレンド"
  },
  {
    "url": "https://blog.twitter.com/",
    "category": "market",
    "subcategory": "sns_trend",
    "extract": "X/Twitter機能変更・ポリシー"
  },
  {
    "url": "https://www.bali.go.id/en",
    "category": "locale",
    "subcategory": "bali_visa",
    "extract": "バリ島ビザ・入国規制・観光政策の変更"
  },
  {
    "url": "https://www.id.emb-japan.go.jp/itpr_ja/consular_dps.html",
    "category": "locale",
    "subcategory": "bali_visa",
    "extract": "在デンパサル総領事館の安全情報・渡航注意"
  },
  {
    "url": "https://jaos.or.jp/data/",
    "category": "market",
    "subcategory": "study_abroad",
    "extract": "日本人の留学者数推移・人気国・トレンド"
  },
  {
    "url": "https://www.ef.com/wwen/epi/",
    "category": "market",
    "subcategory": "study_abroad",
    "extract": "EF EPI 各国英語力ランキング・日本の順位"
  },
  {
    "url": "https://linestep.net/news",
    "category": "technology",
    "subcategory": "lstep",
    "extract": "Lstepの新機能・仕様変更・料金改定"
  },
  {
    "url": "https://blog.cloudflare.com/",
    "category": "technology",
    "subcategory": "cloudflare",
    "extract": "Workers/D1/R2の新機能・料金変更"
  }
]
```

### 抽出ルール

Haikuへのプロンプト:
```
以下のWebページから、事実・数字・変更点を箇条書きで抽出してください。
抽出対象: {extract}
ルール:
- 事実と数字のみ。意見・推測は除外
- 日付がある情報は日付を含める
- 変更があった項目のみ（変化なしならemptyと返す）
- JSON配列で返す: [{"title": "...", "content": "...", "tags": "..."}]
- 1件 = 1つの事実
```

### 重複防止

INSERT前にtitle + categoryで既存チェック:
```sql
SELECT id FROM knowledge_entries
WHERE category = ? AND title = ?
LIMIT 1
```
存在する場合はスキップ。内容が更新されている場合はUPDATE。

### 実行環境

GH Actions weekly cron（毎週月曜 バリ時間9:00 = UTC 1:00）
- Node.jsスクリプト
- fetch + Haiku API
- POST /api/knowledge で投入
- 月間コスト: Haiku 14URL × 4週 = ~$0.5

## 既存コード変更

### 1. D1マイグレーション（0005）
- knowledge_entriesに `source_url TEXT` カラム追加
- 既存データのcategoryを新体系にUPDATE

### 2. knowledge-accumulation.md 更新
- カテゴリ表を新8カテゴリに差し替え

### 3. content-generator.ts 更新
- TYPE_CATEGORIESの値を新カテゴリに更新

### 4. x-auto-poster/src/knowledge.js 更新
- getKnowledgeCategoriesの戻り値を新カテゴリに更新

### 5. seo-writer/src/knowledge.ts 更新
- fetchKnowledgeForSEOのカテゴリ判定を新体系に更新

### 6. POST /api/knowledge 更新
- source_urlフィールドを受け付けるように更新

## 実装スコープ

### Phase A: カテゴリ再設計（既存変更）
- マイグレーション + 既存データ移行
- 全参照コード更新
- ルールファイル更新

### Phase B: 自動収集システム（新規）
- watchlist.json + 収集スクリプト
- GH Actions workflow
- 動作確認
