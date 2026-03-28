# X投稿キュレーション自動パイプライン

## 概要
Xで見つけた参考投稿を共有ボタン1つでチームに投げ、自動で分析・分類・アクション実行する仕組み。

## 背景
- オーナーは1日5件以上のX投稿をキュレーションする
- 「1アクション」で仮想組織チームに共有したい
- ヌケモレ防止が最優先
- 開発/実装系はそのまま実行してほしい

## アーキテクチャ

```
X投稿 → 共有ボタン → HTTP Shortcuts(Android) → GitHub Issue作成
                                                      ↓
                        Remote Trigger(Cron 1日3回) → Issue取得
                                                      ↓
                                    Claude Code(Opus) → WebFetchでX投稿読み取り
                                                      ↓
                              分類・要約・提案 → .company/x-insights/に保存
                              実装系 → そのまま実装・コミット・push
                              処理済み → Issueコメント+クローズ
```

## コンポーネント

### 1. 入口: Android HTTP Shortcuts アプリ

- X共有シート → 「チームに投げる」ボタン
- GitHub REST APIにPOST → Issue作成
- 設定項目:
  - URL: `https://api.github.com/repos/Takuya248-bit/line-harness-oss/issues`
  - Method: POST
  - Headers: `Authorization: Bearer {GITHUB_PAT}`, `Content-Type: application/json`
  - Body: `{"title": "📌 X共有: {url}", "labels": ["x-curation", "unprocessed"], "body": "URL: {shared_url}\n\nメモ: {optional_comment}"}`
- 共有時にメモ入力欄を表示（任意、空でもOK）

### 2. キュー: GitHub Issues

- リポジトリ: Takuya248-bit/line-harness-oss
- ラベルで管理:
  - `x-curation`: キュレーション投稿の識別
  - `unprocessed`: 未処理フラグ
- ヌケモレ防止: openかつunprocessedラベルがある限り必ず処理される
- 処理完了後: unprocessedラベル除去 + クローズ

### 3. 処理エンジン: Remote Trigger

- モデル: claude-opus-4-6
- スケジュール: 1日3回（JST 8:00 / 14:00 / 22:00 = UTC 23:00 / 05:00 / 13:00）
- cron: 3つの個別トリガー、または1つのトリガーで3回
- 処理フロー:
  1. `gh issue list --label x-curation,unprocessed --state open --json number,title,body` で未処理取得
  2. 未処理がなければ即終了（コスト節約）
  3. 各IssueのbodyからURL抽出
  4. WebFetchでX投稿内容を取得
  5. 分析・分類（後述）
  6. ルーティング・保存
  7. 実装可能なものは実行
  8. Issueに処理結果コメント → unprocessedラベル除去 → クローズ

### 4. 分析・分類ロジック

投稿ごとに以下を判定:

カテゴリ:
- `marketing`: マーケ施策、SNS運用、LP、広告、コピーライティング
- `engineering`: 技術、開発手法、ツール、API、インフラ
- `content`: コンテンツ制作、SEO、記事、動画
- `business`: ビジネスモデル、価格戦略、競合分析

アウトプット:
- 要約（3行以内）
- 自社への応用提案（具体的に、どのプロジェクト/部署に、どう活かすか）
- アクション種別: `propose`（提案のみ）/ `implement`（実装実行）/ `research`（追加調査必要）

### 5. ルーティング・保存

保存先: `.company/{department}/x-insights/YYYY-MM.md`（月次ファイル、追記型）

フォーマット:
```markdown
## YYYY-MM-DD | {category}
- URL: {x_url}
- 投稿者: @{username}
- 要約: {3行以内の要約}
- 提案: {自社への応用提案}
- アクション: propose / implement / research
- ステータス: 提案のみ / 実装済み(コミット: {hash}) / Issue作成済み(#{number})
```

ルーティングルール:
- marketing → `.company/marketing/x-insights/`
- engineering → `.company/engineering/x-insights/`
- content → `.company/marketing/x-insights/`（マーケ配下）
- business → `.company/secretary/inbox/`（秘書経由でオーナー判断）

### 6. 自動実装

アクション種別が `implement` の場合:
- 開発タスクとして即実行
- コミット+push
- コミットメッセージ: `feat: {概要} (inspired by x-curation #{issue_number})`
- x-insightsファイルにコミットハッシュを記録

実装判断基準:
- 既存コードベースの改善で、変更が明確なもの → implement
- 新機能追加や設計判断が必要なもの → propose（GitHub Issueで提案）
- 外部サービス調査が必要 → research

## セットアップ手順

### ユーザー側（1回のみ）
1. Android に HTTP Shortcuts アプリをインストール（Google Play Store、無料）
2. GitHubでPersonal Access Token発行（Settings → Developer settings → Fine-grained tokens）
   - 権限: Issues (Read and Write)
   - リポジトリ: Takuya248-bit/line-harness-oss のみ
3. HTTP Shortcutsアプリでショートカット作成（設定テンプレートを提供）

### システム側
1. GitHub Issues にラベル作成: `x-curation`, `unprocessed`
2. Remote Trigger作成（cron 3回/日）
3. `.company/marketing/x-insights/` ディレクトリ作成
4. `.company/engineering/x-insights/` ディレクトリ作成

## コスト
- 全て既存サブスクリプション内で完結（追加課金なし）
- GitHub API: 無料枠内
- HTTP Shortcuts: 無料
- Remote Trigger: Claude Codeサブスクリプション内

## 制約・注意点
- X投稿が削除済み/非公開の場合はWebFetchで取得できない → Issueにその旨コメントしてクローズ
- 画像のみの投稿は内容取得に限界あり → URLと画像の存在のみ記録
- Remote Trigger未処理時（障害等）はIssueがopen/unprocessedのまま残る → 次回バッチで処理される（ヌケモレなし）
