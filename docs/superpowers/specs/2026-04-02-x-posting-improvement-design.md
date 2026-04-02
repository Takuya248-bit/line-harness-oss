# X投稿改善設計 — える & バリリンガル

## 概要

2アカウントのX投稿パイプラインを改善する。コンテンツ品質向上 + PDCA自走 + 初期グロース自動化。

## 対象アカウント

| | える (@eru_linecustom) | バリリンガル (@balilingirl) |
|---|---|---|
| 現状 | .bak無効化、架空事例中心 | 稼働中、平均いいね0.3 |
| ピボット | LINE構築→AI×業務自動化 | 変更なし（留学・英語・バリ生活） |
| 一次情報 | Claude Code実務活用（毎日の実践） | バリ島生活、学校運営、生徒の声 |
| マネタイズ先 | AIツール販売、Lカスタム | LINE登録→留学相談 |

---

## 1. ペルソナ再設計

### える

| 項目 | 変更後 |
|------|--------|
| 表示名 | える｜Claude Codeで仕事を自動化する人 |
| 軸 | AI(Claude Code)×業務自動化の実践記録 |
| トーン | 実践者のリアル（試行錯誤・発見・数字） |
| 禁止 | 架空事例、「友だちN人」系、LINE構築メインの話題 |

カテゴリ（5種）:

| カテゴリ | 内容 | 投稿時間(WITA) |
|---------|------|---------------|
| Tips/How-to | Claude Code・AI活用の具体テクニック | 7:00 |
| 比較・考察 | ツール比較、AI業界の流れへの見解 | 9:00 |
| 問いかけ | フォロワーとの対話、共感 | 12:00 |
| 実践ログ | 今日やったこと・作ったもの・結果 | 17:00 |
| ビジネス視点 | AIで何が売れるか、マネタイズ | 20:00 |

### バリリンガル

ペルソナ変更なし。カテゴリは現行8種を維持。
投稿時間: 7:00, 10:00, 12:00, 17:00, 20:00 (WITA)

---

## 2. パイプライン改善

### える — 復活作業

1. `accounts/eru_linecustom.json.bak` → `accounts/eru_linecustom.json` にリネーム
2. JSON内のsystemPrompt、displayName、contentCategoriesを新ペルソナに全面書き換え
3. `.github/workflows/bird-post.yml` のmatrix.accountに `eru_linecustom` を追加
4. RSS収集ソースをAI系に変更

### RSS収集ソース

| アカウント | ソース |
|-----------|--------|
| える | Anthropic Blog, Simon Willison's Blog, Hacker News(AI filtered), Grok X Search(Claude Code, AI自動化) |
| バリリンガル | 現行維持（education-rss-collector.py） |

### 生成フロー（両アカウント共通）

```
日曜夜 auto-post.yml:
  1. pre-generate-research.js
     → RSS取得 + Grok X Search + analyze-weekly.js(前週分析)
     → content/{account}/research-context.json
  2. run-all-accounts.js generate --days 7
     → Claude Haiku で7日分35件を一括生成
  3. 毎日 bird-post.yml
     → bird CLI で各アカウントの当日分を投稿
```

### systemPrompt方針

える:
- 架空事例を一切禁止
- 一次情報必須（実際にやったこと、使ったツール、具体的な数字）
- research-context.jsonの最新AI情報を毎回注入
- Notionナレッジ（technology, method, ai_newsカテゴリ）を参照

バリリンガル:
- 現行トーン維持
- 一次情報（バリ生活、学校運営）を強化
- Notionナレッジ（educationカテゴリ）を参照

---

## 3. PDCA自走サイクル

両アカウント共通。週次で全自動実行。

```
[Check] report-bird.js
  → 前週35件のエンゲージメント集計（カテゴリ別・時間帯別）

[Act] analyze-weekly.js
  → いいね率上位20% → 「勝ちパターン」としてresearch-contextに注入
  → いいね率下位20% → 「避けるパターン」としてNG例に追加
  → カテゴリ別スコア → 翌週の比率を自動調整（±1枠/週）

[Plan] pre-generate-research.js
  → RSS + Notion + 前週分析 → research-context.json

[Do] generate → 7日分35件生成 → bird CLIで毎日投稿
```

### 自動調整ルール

- カテゴリ別の平均エンゲージメントを比較
- 最高スコアカテゴリ: 翌週+1枠（別時間帯にも配置）
- 最低スコアカテゴリ: 翌週-1枠（最低1枠/週は維持）
- 各カテゴリ: 1〜10枠/週
- 4週連続最下位 → 新カテゴリへの入れ替えをDiscord通知で提案

### KPIアラート（Discord通知）

| 条件 | アクション |
|------|-----------|
| 週平均いいねが前週比50%以下 | 警告通知 |
| 3日連続いいね0 | プロンプト見直し提案 |
| 週平均いいねが前週比200%以上 | 勝ちパターンを強調保存 |

---

## 4. 初期グロース自動化

両アカウント共通アーキテクチャ。ターゲットキーワードのみ異なる。

### 日次アクション

| アクション | 頻度 | 自動化 |
|-----------|------|--------|
| 投稿 | 5件/日 | 全自動 |
| ターゲットへのいいね | 30件/日 | 全自動 |
| リプライ（価値提供型） | 10件/日 | 全自動 |
| 引用RT | 2件/日 | 候補生成→Discord承認→投稿 |

### ターゲットキーワード

| える | バリリンガル |
|------|-------------|
| Claude Code, AI自動化, Claude API | バリ島留学, 英語留学, フィリピン留学 |
| エージェント開発, MCP, LLM活用 | 英語学習, TOEIC, ワーホリ |
| 業務効率化, ノーコード, 個人開発 | 海外移住, バリ島生活, 語学学校 |

### リプライ自動化パイプライン

```
Grok X Search（日次）
  → ターゲットキーワードで検索
  → エンゲージメント対象ツイート抽出（いいね10+、フォロワー500+）
  ↓
フィルタ
  → 24時間以内の投稿のみ
  → 日本語 or 英語
  → 宣伝・アフィ・政治を除外
  ↓
Claude Haiku でリプライ生成
  → 空リプ禁止、必ず情報追加 or 実体験
  → 一次情報テンプレート注入
  → 50〜140文字
  ↓
品質フィルタ（凍結防止）
  → 同一ユーザーへの連続リプ禁止（1日1回まで）
  → 同一文言の使い回し検出 → ブロック
  → 1時間あたり最大3リプ（レートリミット）
  → Jaccard類似度0.7以上 → 再生成
  ↓
bird CLI で投稿
```

### 引用RT（承認制）

- AI候補をDiscordに通知（える用チャンネル / バリリンガル用チャンネル）
- 承認ボタンで投稿 / 編集して投稿 / 却下
- 既存ルール(feedback_quote_review)厳守

### 凍結防止

| ルール | 値 |
|--------|-----|
| 1日の総アクション上限 | 45（いいね30 + リプ10 + 投稿5） |
| ウォームアップ期間（最初2週間） | いいね15 + リプ5 に制限 |
| 1時間あたりリプ上限 | 3件 |
| フォロー/アンフォロー自動化 | しない（BAN最大要因） |
| 同一ユーザーへのリプ | 1日1回まで |
| 週次凍結リスクスコア | 閾値超え→自動減速 |

### フェーズ切り替え

- フェーズ1（0→500フォロワー）: アウトバウンド重視（上記の全アクション実行）
- フェーズ2（500+）: アウトバウンド比率を下げ、投稿品質とバズ狙いにシフト
- 切り替えは週次KPIレポートで自動判定

---

## 5. GitHub Actions ワークフロー構成

| ワークフロー | 役割 | トリガー | 対象 |
|-------------|------|---------|------|
| auto-post.yml | Research→Generate→Buffer | 毎週日曜21:00 WITA | 全アカウント |
| bird-post.yml | 日次投稿 | 毎日(スケジュール時刻) | [eru_linecustom, balilingirl] |
| engagement.yml | いいね+リプライ自動化 | 毎日2回(朝/夕) | 全アカウント |
| weekly-report.yml | KPIレポート+PDCA分析 | 毎週月曜6:00 WITA | 全アカウント |

### 新規: engagement.yml

```yaml
name: Auto Engagement
on:
  schedule:
    - cron: '0 0,9 * * *'  # UTC 0:00, 9:00 = WITA 8:00, 17:00
jobs:
  engage:
    strategy:
      matrix:
        account: [eru_linecustom, balilingirl]
    steps:
      - Grok X Search でターゲットツイート取得
      - Claude Haiku でリプライ生成
      - 品質フィルタ適用
      - bird CLI でいいね + リプライ実行
      - ログ出力（reports/engagement/）
```

---

## 6. ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| accounts/eru_linecustom.json.bak → .json | リネーム + ペルソナ全面書き換え |
| accounts/balilingirl.json | systemPrompt微調整（一次情報強化） |
| .github/workflows/bird-post.yml | matrix.accountにeru_linecustom追加 |
| .github/workflows/engagement.yml | 新規作成（いいね+リプライ自動化） |
| .github/workflows/weekly-report.yml | PDCA分析ステップ追加 |
| .github/workflows/auto-post.yml | える用RSS追加 |
| src/engage.js | 新規: Grok検索→リプライ生成→品質フィルタ→投稿 |
| src/analyze-weekly.js | PDCA自動調整ロジック追加（勝ち/負けパターン、カテゴリ比率調整） |
| src/report-bird.js | カテゴリ別・時間帯別分析追加 |

---

## 7. アカウント間コンテンツ混在防止（必須）

2アカウントの投稿内容は絶対に混ざらないこと。以下の多層防御で担保する。

### データ分離

| レイヤー | える | バリリンガル |
|---------|------|-------------|
| コンテンツ格納 | content/eru_linecustom/ | content/balilingirl/ |
| research-context | content/eru_linecustom/research-context.json | content/balilingirl/research-context.json |
| RSS収集 | AI系フィードのみ | 留学・英語系フィードのみ |
| Notionナレッジ参照 | technology, method, ai_news | education |
| エンゲージメント対象 | AI・開発系ツイート | 留学・英語・バリ系ツイート |
| リプライ用一次情報 | Claude Code実践データ | バリ島生活・学校運営データ |

### 生成時の分離ルール

- systemPromptにアカウント固有のホワイトリストキーワードとブラックリストキーワードを設定
- える: ブラックリスト = 留学, バリ, 英語学習, TOEIC, 語学学校, 寮
- バリリンガル: ブラックリスト = Claude Code, API, エージェント, LLM, プロンプト, Lカスタム, LINE構築
- generate時にブラックリストキーワードを含む投稿は自動却下 → 再生成

### 投稿前バリデーション

```
生成された投稿テキスト
  → ブラックリストキーワードチェック
  → 1つでもヒット → 却下 + 再生成（最大3回）
  → 3回失敗 → スキップ + Discord警告通知
```

### リプライ・いいね対象の分離

- Grok X Search のキーワードセットをアカウント別に完全分離
- 検索結果にアカウント名を紐付けて保存 → 別アカウントの対象には絶対にアクションしない
- engage.js内でアカウント名とキーワードセットの整合性チェックを実行時に検証

---

## 8. 制約・リスク

- bird CLI のAPI制限に依存（Xの仕様変更リスク）
- Grok X Search の利用可否・レート制限の確認が必要
- 全自動リプライは品質次第でブランドリスク → 品質フィルタで軽減
- 2アカウント同時運用時のIP/セッション管理 → bird CLIのアカウント切り替えで対応
- コンテンツ混在リスク → セクション7の多層防御で軽減
