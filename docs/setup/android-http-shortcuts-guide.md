# Android HTTP Shortcuts セットアップガイド

X投稿を1タップでチームに共有するための設定手順。

## 前提条件
- Androidスマートフォン
- GitHubアカウント（Takuya248-bit/line-harness-oss へのアクセス権）

## Step 1: GitHub Personal Access Token 発行

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. 「Generate new token」をタップ
3. 設定:
   - Token name: x-curation-android
   - Expiration: 90 days（期限切れ前に再発行）
   - Repository access: 「Only select repositories」→ Takuya248-bit/line-harness-oss
   - Permissions: Issues → Read and Write
4. 「Generate token」→ トークンをコピー（1回しか表示されない）

## Step 2: HTTP Shortcuts アプリインストール

1. Google Play Store で「HTTP Shortcuts」を検索
   - 正式名: HTTP Shortcuts - REST Client
   - 開発者: Roland Meyer
2. インストール（無料、広告なし）
3. アプリを開く

## Step 3: ショートカット作成

1. 右下の「+」→「Regular Shortcut」
2. 基本設定:
   - Name: チームに投げる
   - Icon: 好みのアイコンを選択
3. 「Request Settings」:
   - Method: POST
   - URL: https://api.github.com/repos/Takuya248-bit/line-harness-oss/issues
4. 「Request Headers」で3つ追加:
   - Authorization: Bearer ghp_xxxxxxxxxx（Step1のトークンに置き換え）
   - Content-Type: application/json
   - Accept: application/vnd.github+json
5. 「Request Body」→ Type: Custom Text、Content-Type: application/json:
   ```json
   {"title":"📌 X共有: {{share_text}}","labels":["x-curation","unprocessed"],"body":"URL: {{share_text}}\n\nメモ: {{memo}}"}
   ```
6. 「Scripting」→ 変数を2つ定義:
   - share_text: Type → 「Share text from intent」（共有されたURLを受け取る）
   - memo: Type → 「Text Input」（Title: "メモ（任意）", Allow empty: ON）

## Step 4: 共有シートに追加

1. ショートカット保存後、ショートカットを長押し
2. メニューから「Share into」→ 有効化
3. Androidの共有シートに「チームに投げる」が表示されるようになる

## 使い方

1. Xアプリで気になる投稿を開く
2. 共有ボタン（↗）をタップ
3. 共有先から「HTTP Shortcuts」→「チームに投げる」を選択
4. （任意）メモを入力して送信
5. 完了! GitHub Issueが自動作成され、1日3回（8時/14時/22時）のバッチで自動処理される

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 401 Unauthorized | トークン期限切れ or 入力ミス | Step 1で再発行し、ショートカットのHeaderを更新 |
| 404 Not Found | リポジトリ名の誤り | URLを確認 |
| 422 Unprocessable | ラベルが存在しない | リポジトリにx-curation, unprocessedラベルがあるか確認 |
| 共有シートに表示されない | Share into未設定 | Step 4を再確認 |

## トークン更新手順（90日ごと）

1. GitHub → Settings → Developer settings → Personal access tokens
2. 期限切れトークンを削除
3. Step 1の手順で新規発行
4. HTTP Shortcutsアプリ → ショートカット編集 → Headers → Authorizationの値を更新
