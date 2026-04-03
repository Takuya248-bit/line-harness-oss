# X投稿管理ダッシュボード設計

## 概要

腸活サプリ会社のX運用代行用ダッシュボード。クライアントと共有し、投稿承認・パフォーマンス確認を行う。

- 対象: 腸活サプリ会社（1社専用）
- 運用形態: 手動投稿（自動生成なし）
- 認証: Cloudflare Access（メールOTP）
- コスト: 0円（Cloudflare無料枠）

## アーキテクチャ

```
クライアント(ブラウザ)
  ↓ Cloudflare Access (メール認証)
[Cloudflare Pages] ← React (Vite) SPA
  ↓
[Cloudflare Workers] ← Hono API
  ↓
[Cloudflare D1] ← SQLite

[GitHub Actions] → bird CLI → D1 API（投稿実行・メトリクス収集）
```

- Pages + Workers で完結
- 認証はCloudflare Accessに委任（アプリ側ログイン実装不要）
- bird CLIはGitHub Actionsで実行し、APIでD1に書き込む

## データモデル

```sql
-- 投稿管理
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  media_urls TEXT,
  status TEXT DEFAULT 'draft',  -- draft / pending_approval / approved / rejected / posted
  thread_id TEXT,               -- スレッド先頭のpost ID（NULLなら単体投稿）
  thread_order INTEGER DEFAULT 0, -- スレッド内の順番（0が先頭）
  scheduled_at TEXT,
  posted_at TEXT,
  tweet_id TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- パフォーマンスデータ
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT REFERENCES posts(id),
  impressions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  collected_at TEXT DEFAULT (datetime('now'))
);

-- フォロワー推移
CREATE TABLE follower_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count INTEGER NOT NULL,
  recorded_at TEXT DEFAULT (datetime('now'))
);
```

## API設計（Hono）

```
# 投稿CRUD
GET    /api/posts              -- 一覧（status/日付でフィルタ）
POST   /api/posts              -- 新規作成（draft）
PUT    /api/posts/:id          -- 編集
DELETE /api/posts/:id          -- 削除（draftのみ）

# 承認フロー
POST   /api/posts/:id/submit   -- draft → pending_approval
POST   /api/posts/:id/approve  -- pending_approval → approved
POST   /api/posts/:id/reject   -- pending_approval → rejected（理由付き）

# パフォーマンス
GET    /api/metrics/summary    -- 全体サマリー（期間指定）
GET    /api/metrics/posts      -- 投稿別パフォーマンス

# フォロワー
GET    /api/followers          -- フォロワー推移

# カレンダー
GET    /api/calendar           -- 月/週の投稿カレンダーデータ
```

ロール判定: Cloudflare Accessのメールアドレスで管理者/クライアントを識別。

## フロント画面構成

### ダッシュボード（/）
- 今週のKPI: インプレッション合計・エンゲージメント率・フォロワー増減
- 承認待ち件数（バッジ表示）
- 直近の投稿5件

### 投稿一覧（/posts）
- ステータスタブ: 全て / 下書き / 承認待ち / 承認済み / 投稿済み / 却下
- 投稿カード: 本文プレビュー・予定日時・ステータスバッジ
- スレッド投稿はカード内にツリー表示（1/3, 2/3...のインジケーター）
- 管理者: 新規作成・編集・submit、「+ ツイートを追加」でスレッド化
- クライアント: approve/reject + 却下理由入力（スレッドは一括承認）

### カレンダー（/calendar）
- 月表示カレンダー、ステータス色分け
- 日付クリックで該当日の投稿一覧
- ドラッグでスケジュール変更（管理者のみ）

### パフォーマンス（/analytics）
- フォロワー推移グラフ（折れ線）
- 投稿別エンゲージメントランキング
- 期間フィルタ（7日/30日/全期間）

## 投稿実行・データ収集

### 投稿実行
- GitHub Actions Cron(5分毎): approved + scheduled_at が過去の投稿を検出
- 単体投稿: bird CLIで投稿 → tweet_idを保存 → status: posted
- スレッド投稿: thread_id でグループ化 → thread_order 昇順で連続投稿。各ツイートは前のtweet_idにリプライしてスレッド構成

### メトリクス収集
- GitHub Actions Cron(6時間毎): 直近7日分のposted投稿のメトリクスをbird CLIで取得
- API経由でmetricsテーブルに追記

### フォロワー数
- GitHub Actions Cron(日次): bird CLIでフォロワー数取得
- API経由でfollower_historyに追記

## セキュリティ

- Cloudflare Access: メールOTP認証（無料枠50ユーザー）
- HTTPS強制（Cloudflare標準）
- DDoS対策（Cloudflare標準）
- D1バインディング: Workers内部からのみアクセス可
- APIはCloudflare Accessトークン検証済みリクエストのみ受付
