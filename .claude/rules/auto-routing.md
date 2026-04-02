# タスク自動ルーティング

ユーザーの指示を受けたら、キーワード指定がなくても最適なモードを自動選択する。

## 実装フロー（最優先）

コード変更を伴うタスクは必ず dev-loop に従う。Claude Codeが自分で実装するのは小修正（1-10行）のみ。

| 規模 | dev-loopモード | フロー |
|------|---------------|--------|
| 小修正（1-10行） | quick | Claude Code直接編集→Codex review |
| 中規模（10-100行） | normal | Claude Code指示書→Cursor実装→Codex review |
| 大規模（100行+） | full | 指示書→Cursor実装→Codex review→Claude改善指示→Cursor修正（max 2回） |

## 判定フロー

1. 指示を受け取る
2. コード変更あり？→ dev-loop で規模判定
3. コード変更なし？→ 以下の分類で判定
4. 選択したモードを1行で宣言してから実行

## 分類ルール

| 条件 | モード | 理由 |
|------|--------|------|
| 単発の質問・調査・確認 | 通常応答 | エージェント不要 |
| 1ファイルの軽微な修正（1-10行） | dev-loop quick | Claude Code直接+Codex review |
| 中規模の実装（10-100行） | dev-loop normal | 指示書→Cursor→Codex review |
| 大規模の実装（100行+） | dev-loop full | 指示書→Cursor→review→修正ループ |
| 要件が曖昧・設計判断が必要 | planner→確認→dev-loop | 先に計画を固める |
| アーキテクチャ・設計レビュー | architect | 読み取り専門・高品質分析 |
| セキュリティ監査 | security-reviewer | 専門エージェント |
| コードレビュー | code-reviewer | 専門エージェント |
| デバッグ・原因特定 | debugger→dev-loop | 原因特定後、修正はdev-loopで |
| 「おまかせ」「やっといて」 | 規模に応じたdev-loop | 設計→指示書→Cursor |

## ツール分担

| 役割 | ツール |
|------|--------|
| 設計・判断・改善指示 | Claude Code |
| 実装・修正 | Cursor（Composer） |
| レビュー | Codex |
| ブレスト・要件整理 | superpowers:brainstorming |
| プラン作成 | superpowers:writing-plans |
| 記事・LP・SNS | 自前スキル（seo-writing, publish-article等） |
| LINE/Lstep操作 | 自前スキル（lstep-automation） |
| Git完了フロー | superpowers:finishing-a-development-branch |

## 注意

- モード選択を毎回ユーザーに聞かない。自動で判断して宣言→実行
- コード変更は必ずdev-loopを通す。Claude Codeが10行超の実装を自分で書かない
- 判断に迷ったらdev-loop normal
- ユーザーが明示的にキーワード指定した場合はそちらを優先
