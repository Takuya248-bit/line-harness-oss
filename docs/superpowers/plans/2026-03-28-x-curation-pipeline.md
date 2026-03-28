# X投稿キュレーション自動パイプライン 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xアプリの共有ボタン1つで投稿をチームに投げ、自動分析・分類・実装まで行うパイプラインを構築する

**Architecture:** Android HTTP Shortcutsアプリ → GitHub Issue（キュー） → Remote Trigger（Cron 1日3回、Opus）→ 分析・ルーティング・自動実装。GitHub Issueのopen/closedで状態管理し、ヌケモレを防止する。

**Tech Stack:** GitHub Issues API, GitHub CLI (gh), Claude Code Remote Triggers, HTTP Shortcuts (Android)

---

### Task 1: GitHubラベル作成

**Files:** なし（GitHub API操作のみ）

- [ ] **Step 1: x-curation ラベル作成**

```bash
gh label create "x-curation" --repo Takuya248-bit/line-harness-oss --color "1d76db" --description "X投稿キュレーション"
```

Expected: ラベル `x-curation` が作成される

- [ ] **Step 2: unprocessed ラベル作成**

```bash
gh label create "unprocessed" --repo Takuya248-bit/line-harness-oss --color "e4e669" --description "未処理（Remote Triggerが処理待ち）"
```

Expected: ラベル `unprocessed` が作成される

- [ ] **Step 3: ラベル存在確認**

```bash
gh label list --repo Takuya248-bit/line-harness-oss --search "x-curation"
gh label list --repo Takuya248-bit/line-harness-oss --search "unprocessed"
```

Expected: 両ラベルが表示される

- [ ] **Step 4: コミット不要（GitHub側の変更のみ）**

---

### Task 2: ディレクトリ構造・初期ファイル作成

**Files:**
- Create: `.company/marketing/x-insights/.gitkeep`
- Create: `.company/engineering/x-insights/.gitkeep`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p .company/marketing/x-insights
mkdir -p .company/engineering/x-insights
```

- [ ] **Step 2: .gitkeep作成（空ディレクトリをgit管理するため）**

```bash
touch .company/marketing/x-insights/.gitkeep
touch .company/engineering/x-insights/.gitkeep
```

- [ ] **Step 3: コミット**

```bash
git add .company/marketing/x-insights/.gitkeep .company/engineering/x-insights/.gitkeep
git commit -m "chore: create x-insights directories for curation pipeline"
```

---

### Task 3: Remote Trigger作成

**Files:** なし（Remote Trigger API操作）

- [ ] **Step 1: Remote Triggerを作成**

RemoteTrigger APIで以下のトリガーを作成する:

- name: `x-curation-processor`
- cron_expression: `0 23,5,13 * * *`（UTC 23:00/05:00/13:00 = JST 8:00/14:00/22:00）
- model: `claude-opus-4-6`
- allowed_tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `WebSearch`
- environment_id: `env_01EewcJW2vQwVT8zssSJw14P`（既存と同じ）
- sources: `https://github.com/Takuya248-bit/line-harness-oss`

プロンプト内容:

```
あなたはX投稿キュレーション処理エージェントです。

## タスク
GitHub Issueに溜まった未処理のX投稿を分析・分類し、.company/の該当部署に保存する。
開発/実装系で即実行可能なものはそのまま実装・コミット・pushする。

## 手順

### 1. 未処理Issue取得
gh issue list --repo Takuya248-bit/line-harness-oss --label x-curation,unprocessed --state open --json number,title,body,createdAt --limit 20

未処理がなければ「未処理なし」と出力して終了する。

### 2. 各Issueを処理
IssueのbodyからURLを抽出し、WebFetchで投稿内容を取得する。
取得できない場合（削除済み/非公開）はその旨をIssueにコメントしてクローズする。

### 3. 分析・分類
各投稿について以下を判定する:

カテゴリ（1つ選択）:
- marketing: マーケ施策、SNS運用、LP、広告、コピーライティング
- engineering: 技術、開発手法、ツール、API、インフラ
- content: コンテンツ制作、SEO、記事、動画
- business: ビジネスモデル、価格戦略、競合分析

アクション種別:
- propose: 提案のみ（新機能追加や設計判断が必要）
- implement: 即実装（既存コードの改善で変更が明確）
- research: 追加調査が必要

### 4. 保存
カテゴリに応じて以下に追記する（月次ファイル、なければ作成）:
- marketing/content → .company/marketing/x-insights/YYYY-MM.md
- engineering → .company/engineering/x-insights/YYYY-MM.md
- business → .company/secretary/inbox/YYYY-MM-DD.md

追記フォーマット:
## YYYY-MM-DD | {category}
- URL: {url}
- 投稿者: @{username}
- 要約: {3行以内}
- 提案: {自社（Lカスタム/バリリンガル）への具体的な応用提案}
- アクション: {propose/implement/research}
- ステータス: {提案のみ/実装済み(コミット: hash)/調査待ち}

### 5. 自動実装（implement判定の場合のみ）
- 実装 → テスト → コミット → push
- コミットメッセージ: feat: {概要} (inspired by x-curation #{issue_number})
- x-insightsファイルのステータスをコミットハッシュ付きで更新

### 6. Issue処理完了
各Issueに対して:
1. 処理結果をコメントとして追記:
   gh issue comment {number} --repo Takuya248-bit/line-harness-oss --body "処理結果のMarkdown"
2. unprocessedラベルを除去:
   gh issue edit {number} --repo Takuya248-bit/line-harness-oss --remove-label unprocessed
3. Issueをクローズ:
   gh issue close {number} --repo Takuya248-bit/line-harness-oss

### 7. 変更のコミット・push
x-insightsファイルの変更をコミット+pushする:
git add .company/
git commit -m "chore: process x-curation issues"
git push

## 重要ルール
- 未処理がなければ即終了（コスト節約）
- X投稿の内容取得にはWebFetchを使う。外部APIは使わない
- 実装判定(implement)は保守的に。迷ったらproposeにする
- Lカスタム/バリリンガルの文脈を理解した上で提案する
- .company/secretary/notes/ の直近のdecisions.mdを読み、過去の決定事項と矛盾しない提案をする
```

- [ ] **Step 2: トリガーの動作確認（手動実行）**

テスト用Issueを1件作成してから手動実行:

```bash
gh issue create --repo Takuya248-bit/line-harness-oss \
  --title "📌 X共有: https://x.com/test_example/status/123" \
  --label "x-curation,unprocessed" \
  --body "URL: https://x.com/test_example/status/123

メモ: テスト投稿"
```

RemoteTrigger run で手動実行し、以下を確認:
- Issueが処理されてクローズされること
- x-insightsファイルにエントリが追記されること
- unprocessedラベルが除去されること

- [ ] **Step 3: テストIssueをクリーンアップ（必要に応じて）**

---

### Task 4: HTTP Shortcuts設定ガイド作成

**Files:**
- Create: `docs/setup/android-http-shortcuts-guide.md`

- [ ] **Step 1: セットアップガイドを作成**

```markdown
# Android HTTP Shortcuts セットアップガイド

X投稿を1タップでチームに共有するための設定手順。

## 前提条件
- Androidスマートフォン
- GitHubアカウント（Takuya248-bit/line-harness-oss へのアクセス権）

## Step 1: GitHub Personal Access Token 発行

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. 「Generate new token」をタップ
3. 設定:
   - Token name: `x-curation-android`
   - Expiration: 90 days（期限切れ前に再発行）
   - Repository access: 「Only select repositories」→ `Takuya248-bit/line-harness-oss`
   - Permissions: Issues → Read and Write
4. 「Generate token」→ トークンをコピー（1回しか表示されない）

## Step 2: HTTP Shortcuts アプリインストール

1. Google Play Store で「HTTP Shortcuts」を検索
2. インストール（無料、広告なし）
3. アプリを開く

## Step 3: ショートカット作成

1. 右下の「+」→「Regular Shortcut」
2. 基本設定:
   - Name: `チームに投げる`
   - Description: `X投稿をGitHub Issueに登録`
3. 「Request Settings」:
   - Method: `POST`
   - URL: `https://api.github.com/repos/Takuya248-bit/line-harness-oss/issues`
4. 「Headers」:
   - `Authorization`: `Bearer ghp_xxxxxxxxxx`（Step1のトークン）
   - `Content-Type`: `application/json`
   - `Accept`: `application/vnd.github+json`
5. 「Request Body」→ Type: `Custom Text`、Content-Type: `application/json`:
   ```json
   {
     "title": "📌 X共有: {{share_text}}",
     "labels": ["x-curation", "unprocessed"],
     "body": "URL: {{share_text}}\n\nメモ: {{memo}}"
   }
   ```
6. 「Scripting」→ 「Run before execution」:
   - Variable `share_text`: Type → Share text from intent
   - Variable `memo`: Type → Text Input (title: "メモ（任意）", allow empty)

## Step 4: 共有ボタンに追加

1. ショートカット保存後、ショートカットを長押し
2. 「Share into」→ 有効化
3. これでAndroidの共有シートに「チームに投げる」が表示される

## 使い方

1. Xアプリで気になる投稿を開く
2. 共有ボタンをタップ
3. 「HTTP Shortcuts」→「チームに投げる」を選択
4. （任意）メモを入力
5. 完了! GitHub Issueが自動作成され、次のバッチで処理される

## トラブルシューティング

- 401エラー: トークンの期限切れ。Step 1で再発行
- 404エラー: リポジトリ名を確認
- 422エラー: ラベルが存在しない。リポジトリにx-curation, unprocessedラベルがあるか確認
```

- [ ] **Step 2: コミット**

```bash
git add docs/setup/android-http-shortcuts-guide.md
git commit -m "docs: Android HTTP Shortcuts setup guide for X curation"
```

---

### Task 5: 全体テスト・push

- [ ] **Step 1: 全変更をpush**

```bash
git push origin main
```

- [ ] **Step 2: Remote Triggerを手動実行してE2Eテスト**

テスト用のX投稿URL（実在する公開投稿）でIssueを作成し、トリガーを手動実行。
確認項目:
- Issue取得 → WebFetchでX投稿内容取得 → 分類 → x-insightsに保存 → Issueクローズ
- 全フローが正常に動作すること

- [ ] **Step 3: テスト結果に応じてプロンプト調整**

問題があればRemoteTrigger updateでプロンプトを修正。

- [ ] **Step 4: progress.mdに作業ログ追記**
