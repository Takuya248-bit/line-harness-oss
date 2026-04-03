# Crowdsourcing Autopilot - マルチプラットフォーム案件自動化パイプライン

## 概要

クラウドソーシング全プラットフォームの案件発見→応募→納品→請求を最大限自動化するシステム。
日本語ネイティブ × 開発者スキルを活かし、翻訳/AI評価/ローカライゼーション/コンテンツの4ジャンルで月$5,000+を目指す。

## 対象プラットフォーム

### API型（L1: HTTP直接）
- Upwork（GraphQL API、OAuth2、日次40,000リクエスト）
- CrowdWorks（REST API）
- Lancers（REST API）
- Freelancer.com（REST API）

### Gig/タスク型（L2: Lightpanda or L1内部API解析）
- Fiverr（Gig常設→受注対応）
- ココナラ（Gig常設→受注対応）
- Scale AI（RLHFタスク取得）
- DataAnnotation（RLHFタスク取得）
- Remotasks（RLHFタスク取得）
- Appen（RLHFタスク取得）

### 将来追加
- Toptal（審査通過後）
- Bizseek
- シュフティ

## アーキテクチャ

```
[Platform Adapters]
  ├─ L1: httpx直接（API型 + 内部API解析）
  ├─ L2: Lightpanda（JSレンダリング必須サイト）
  └─ L3: Browser Use（AI判断が必要な複雑操作、最終手段）
        ↓
[Unified Job Queue (SQLite)]
        ↓
[LLM Filter & Scorer (Groq)]
        ↓
[Proposal Generator (Groq → fallback Claude Haiku)]
        ↓
[Discord通知 (#upwork)]
  ├─ #jobs-high (70点+、提案文付き)
  ├─ #jobs-maybe (50-69点)
  ├─ #rlhf (RLHFタスク通知)
  ├─ #deliveries (納品承認待ち)
  └─ #revenue (日次/週次レポート)
        ↓ 承認
[Platform Adapters] → 応募送信 / 納品送信
        ↓
[Contract Manager (SQLite → D1同期)]
```

## 技術スタック

- 言語: Python
- HTTP: httpx + beautifulsoup4
- ブラウザ: Lightpanda（24MB、起動100ms、CDP互換）
- AI操作: Browser Use（最終手段のみ）
- LLM: Groq API (Llama 3.3-70B、無料) → fallback Claude Haiku
- DB: SQLite（ローカル） → Cloudflare D1（ダッシュボード用に同期）
- 通知: Discord Webhook
- Cron: GitHub Actions（5分間隔スキャン）
- 設定: YAML（プラットフォーム別設定、スキャン条件）

## ブラウザ自動化3層構造

| 層 | 手段 | 用途 | メモリ |
|---|---|---|---|
| L1 | httpx + BS4 | API型 + 非JSサイト + 内部API解析 | 最軽量 |
| L2 | Lightpanda (CDP) | JSレンダリング必須 + ログイン操作 | 24MB |
| L3 | Browser Use | AI判断が必要な複雑操作 | 重い |

方針: まずL1でDevTools内部APIを解析→直叩き。JSレンダリング必須の場合のみL2。L3は最終手段。

## プラットフォーム別自動化マトリクス

| プラットフォーム | 案件取得 | 応募 | 納品 | 層 | 自動化度 |
|---|---|---|---|---|---|
| Upwork | GraphQL API | API+承認 | API | L1 | 95% |
| CrowdWorks | REST API | API+承認 | API | L1 | 95% |
| Lancers | REST API | API+承認 | API | L1 | 95% |
| Freelancer.com | REST API | API+承認 | API | L1 | 95% |
| Fiverr | httpx/Lightpanda | 出品済→受注 | Lightpanda+承認 | L1→L2 | 80% |
| ココナラ | Lightpanda | 出品済→受注 | Lightpanda+承認 | L2 | 80% |
| Scale AI | httpx(内部API) | タスク取得 | Lightpanda | L1→L2 | 85% |
| DataAnnotation | httpx(内部API) | タスク取得 | Lightpanda | L1→L2 | 85% |
| Remotasks | httpx(内部API) | タスク取得 | Lightpanda | L1→L2 | 85% |
| Appen | Lightpanda | タスク取得 | Lightpanda | L2 | 85% |

## Job Scanner

### スキャン条件

```yaml
scan_config:
  categories:
    - Translation
    - AI/ML
    - Web Development
    - Localization
    - Content Writing
  keywords:
    - Japanese
    - 日本語
    - localization
    - RLHF
    - AI evaluation
    - translation
    - 翻訳
    - ローカライゼーション
    - SEO
    - ライティング
  budget_min:
    hourly: 20  # USD
    fixed: 50   # USD
  scan_interval: 300  # 5分
  priority_window: 900  # 投稿15分以内を優先
```

### LLMスコアリング（0-100点）

| 軸 | 重み | 内容 |
|---|---|---|
| スキルマッチ | 30% | 日本語+技術の合致度 |
| 単価期待値 | 25% | 予算レンジ × 作業時間 |
| 自動化可能性 | 20% | AI生成で納品できるか |
| 競合状況 | 15% | 提案数が少ないほど高得点 |
| クライアント信頼度 | 10% | 過去の発注履歴・レビュー |

### 閾値

- 70点以上: Discord通知 + 提案文自動生成
- 50-69点: Discord通知のみ（手動判断）
- 49点以下: スキップ（ログのみ）

## 提案文生成

### テンプレート構造（150-200語）

1. 冒頭: クライアントの課題理解を示す1文
2. 解決策: 具体的にどうやるか（成果ベース）
3. 実績/差別化: 日本語ネイティブ+開発者の強み
4. クロージング: 質問で締める（返信率UP）

### 学習機能

- 採用された提案文をfew-shot DBに自動追加
- プラットフォーム × カテゴリ別にfew-shot例を蓄積
- スキップ理由もDBに記録しフィルタ精度を改善

## Discord承認フロー

### 通知フォーマット

```
🔍 [Upwork] [スコア: 85] Japanese App Localization
💰 $40-60/h | 固定$2,000
⏰ 投稿: 3分前 | 提案数: 2件
📋 iOS/Androidアプリの日英ローカライゼーション...

--- 提案文ドラフト ---
(生成された150-200語)

[✅ 送信] [✏️ 編集] [❌ スキップ]
```

### フロー

- ✅ 送信: API/Lightpanda経由で即提案送信 → DB記録
- ✏️ 編集: Discordスレッドで修正テキスト入力 → 再送信
- ❌ スキップ: 理由をDBに記録
- 5分無応答: リマインド1回。さらに10分: スキップ扱い

## 納品パイプライン

### タイプ別フロー

| タイプ | フロー |
|---|---|
| RLHF/AI評価 | Discord通知「作業開始」→ 手動作業 → 手動納品 |
| 翻訳（英→日） | Groq翻訳 → Claude Haiku品質チェック → Discord承認 → 納品 |
| 翻訳（日→英） | 同上 |
| 技術ローカライゼーション | AI下書き → Discord承認 → 手動微調整 → 納品 |
| コンテンツ作成 | Groq生成 → Discord承認 → 納品 |

### 翻訳品質チェック（自動）

Groqで翻訳 → Claude Haikuで検証:
- 誤訳/ニュアンスずれ
- 用語一貫性
- 自然さスコア（1-10）
- スコア8以上: 承認待ちへ
- 7以下: 自動リトライ1回 → それでも7以下ならDiscordで手動修正依頼

## DB設計（SQLite）

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  budget_min REAL,
  budget_max REAL,
  budget_type TEXT, -- 'hourly' or 'fixed'
  category TEXT, -- 'rlhf', 'translation', 'localization', 'content', 'tech'
  score INTEGER,
  status TEXT DEFAULT 'new', -- 'new', 'notified', 'applied', 'skipped'
  posted_at TEXT,
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_id)
);

CREATE TABLE proposals (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  text TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'accepted', 'rejected'
  sent_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contracts (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  platform TEXT NOT NULL,
  type TEXT NOT NULL, -- 'rlhf', 'translation', 'localization', 'content', 'tech'
  rate REAL,
  rate_type TEXT, -- 'hourly', 'fixed'
  deadline TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'delivered', 'completed', 'cancelled'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliverables (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id),
  content TEXT,
  review_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  submitted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposal_templates (
  id INTEGER PRIMARY KEY,
  platform TEXT,
  category TEXT,
  text TEXT NOT NULL,
  was_accepted BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## ディレクトリ構成

```
crowdsourcing-autopilot/
├── config/
│   ├── platforms.yaml      # プラットフォーム別設定
│   ├── scan.yaml           # スキャン条件
│   └── profiles.yaml       # プロフィール・Gig設定
├── adapters/
│   ├── base.py             # BaseAdapter ABC
│   ├── upwork.py
│   ├── crowdworks.py
│   ├── lancers.py
│   ├── freelancer.py
│   ├── fiverr.py
│   ├── coconala.py
│   ├── scale_ai.py
│   ├── dataannotation.py
│   ├── remotasks.py
│   └── appen.py
├── core/
│   ├── scanner.py          # Job Scanner (Cron)
│   ├── scorer.py           # LLM Filter & Scorer
│   ├── proposer.py         # Proposal Generator
│   ├── deliverer.py        # Delivery Pipeline
│   ├── tracker.py          # Contract Manager
│   └── reporter.py         # Revenue Reporter
├── discord/
│   ├── notifier.py         # Discord Webhook通知
│   └── bot.py              # Discord Bot（承認ボタン処理）
├── browser/
│   ├── lightpanda.py       # Lightpanda CDP wrapper
│   └── browser_use.py      # Browser Use wrapper（最終手段）
├── db/
│   ├── models.py           # SQLite models
│   └── migrate.py          # Migration
├── main.py                 # エントリーポイント
├── requirements.txt
└── README.md
```

## 立ち上げフェーズ

### Phase 1: 基盤 + RLHF登録（Week 1-2）
- Pythonプロジェクト初期化、DB、Discord通知
- Upworkアカウント作成 + API申請
- Scale AI / DataAnnotation / Remotasks / Appen 登録
- Fiverrに翻訳Gig 5個出品
- ココナラに翻訳/校正サービス出品
- プロフィール: "Full-Stack Developer & Japanese Localization Specialist"

### Phase 2: Scanner稼働 + 実績づくり（Week 3-6）
- Upwork API承認後、Job Scanner稼働
- CrowdWorks / Lancers / Freelancer.com Adapter実装
- $50-100の小案件を5件完了→Rising Talentバッジ
- 週10-15件の提案送信
- 勝ちパターンfew-shot蓄積開始

### Phase 3: 納品自動化（Week 7-10）
- 翻訳AI納品パイプライン稼働
- コンテンツAI生成パイプライン稼働
- 単価$30-50/hに引き上げ
- RLHF案件比率UP

### Phase 4: スケール（Month 3+）
- 全プラットフォーム自動化完了
- 提案文LLMプロンプト最適化（勝率データ活用）
- 月$5,000→$10,000スケール
- 高単価リピートクライアント囲い込み

## コスト

| 項目 | コスト |
|---|---|
| インフラ（Workers/D1/GH Actions） | $0（無料枠） |
| LLM（Groq） | $0（無料） |
| LLM fallback（Claude Haiku） | ~$5/月 |
| Upwork Connects | ~$10-20/月 |
| Lightpanda | $0（OSS） |
| プラットフォーム手数料 | 10-20%（売上から） |

## 収益見込み

| 期間 | 収益 |
|---|---|
| Week 1-2 | $500-1,000（RLHF + Fiverr初受注） |
| Week 3-4 | $1,500-2,500（Upwork初案件 + RLHF） |
| Month 2 | $3,000-5,000（全プラットフォーム稼働） |
| Month 3+ | $5,000-10,000（Agency化 + AI納品量産） |

## BAN対策

- API型は公式APIのみ使用（スクレイピングしない）
- ブラウザ操作は人間的間隔（ランダム2-5秒ディレイ）
- 1プラットフォーム巡回間隔10分以上
- Cookie/セッション永続化
- 不可逆操作（応募送信・納品）は必ずDiscord承認
- 操作ログ全てJSON保存

## 成功基準

- Phase 1完了: 全プラットフォーム登録完了、Discord通知稼働
- Phase 2完了: Upwork実績5件、Rising Talentバッジ取得
- Phase 3完了: 翻訳案件のAI納品率80%以上
- Phase 4完了: 月収$5,000安定達成
