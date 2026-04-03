# タスク自動ルーティング

ユーザーの指示を受けたら、キーワード指定がなくても最適なモードを自動選択する。

## 実装フロー（最優先）

コード変更を伴うタスクは必ず dev-loop に従う。Claude Codeが自分で実装するのは小修正（1-10行）のみ。

| 規模 | dev-loopモード | フロー |
|------|---------------|--------|
| 小修正（1-10行） | quick | Claude Code直接編集→Codex review |
| 中規模（10-100行） | normal | Claude Code指示書→Cursor実装→Codex review |
| 大規模（100行+） | full | 指示書→Cursor実装→Codex review→Claude改善指示→Cursor修正（max 2回） |
| 複数タスク並列 | parallel | タスク分解→tasks.json→複数Cursor並列→各Codex review |

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
| 中規模の実装（10-100行） | dev-loop normal | 指示書→cursor-agent自動実装→Codex review |
| 大規模の実装（100行+） | dev-loop full | 指示書→cursor-agent自動実装→review→修正ループ |
| 要件が曖昧・設計判断が必要 | brainstorming→writing-plans→dev-loop | 先に計画を固めてから自動実装 |
| アーキテクチャ・設計レビュー | architect | 読み取り専門・高品質分析 |
| セキュリティ監査 | security-reviewer | 専門エージェント |
| コードレビュー | code-reviewer または Codex | 専門エージェント |
| デバッグ・原因特定 | debugger→dev-loop | 原因特定後、修正はdev-loopで |
| 複数ファイル横断・独立タスク複数 | dev-loop parallel | タスク分解→複数cursor-agent並列自動実行 |
| 「おまかせ」「やっといて」 | 規模に応じたdev-loop | 設計→指示書→cursor-agent自動実行 |
| 実装完了・PR作成 | finishing-a-development-branch | commit/PR作成のみ。コード変更は行わない |

## ツール分担

| 役割 | ツール |
|------|--------|
| 設計・判断・改善指示 | Claude Code |
| 実装・修正（自動） | dev-loop.sh（cursor-agent --yolo で無人実行） |
| レビュー | Codex（dev-loop.sh内で自動実行） |
| ブレスト・要件整理 | superpowers:brainstorming → 完了後dev-loopへ移行 |
| プラン作成 | superpowers:writing-plans → 完了後dev-loopへ移行 |
| Git完了フロー | superpowers:finishing-a-development-branch |
| 記事・LP・SNS | 自前スキル（seo-writing, publish-article等） |
| LINE/Lstep操作 | 自前スキル（lstep-automation） |

ユーザーに「Cursorで実装してください」と手動操作を頼まない。Claude Codeが `./scripts/dev-loop.sh normal/full` をBashで実行する。

## Opus自動委譲（メインはSonnet固定）

メインセッションはSonnetで動作し、Opus相当の判断が必要な場合はサブエージェントに自動委譲する。/model切替は不要。

Opusサブエージェントに委譲するタスク:
- アーキテクチャ設計・技術選定の判断
- 複雑なデバッグの根本原因分析
- セキュリティ監査・パフォーマンス最適化の設計
- 大規模リファクタリング・移行の計画策定

委譲方法: `Agent(prompt: "...", model: "opus", subagent_type: "architect")` 等で分析結果のみ受け取り、メインが実行判断する。

委譲しない（Sonnetで処理）:
- 通常の実装・修正・調査
- ファイル操作・コミット・デプロイ
- 定型的なコンテンツ生成

## Cursor障害時のフォールバック

Cursor（cursor-agent / api2.cursor.sh）が使えない場合のみ、CC直接実装を許可する。
ただし以下を厳守:
1. progress.mdに「Cursor障害のためCC直接実装」と理由を明記
2. 障害復旧後は次回からCursorに戻す
3. CC直接実装した場合もCodex reviewは必須

## superpowersスキルとの優先順位

dev-loopはsuperpowersの実装系スキルより優先する。

使用禁止スキル（発動しそうになったらスキップしてdev-loopへ）:
- `executing-plans`、`subagent-driven-development`、`test-driven-development`、`verification-before-completion`
- 理由: これらはClaude Codeに実装・テスト・検証をさせる。Cursor+Codexが担当すべき

設計フェーズのみ使用OK:
- `brainstorming` → 完了したら即dev-loopに移行。brainstorming内で実装しない
- `writing-plans` → プラン完成後は即dev-loopに移行。plans内で実装しない
- `finishing-a-development-branch` → commit/PR作成のみ使用。コード変更は行わない

## 注意

- モード選択を毎回ユーザーに聞かない。自動で判断して宣言→実行
- コード変更は必ずdev-loopを通す。Claude Codeが10行超の実装を自分で書かない
- ユーザーに「Cursorで実装してください」「Cursor Composerで〜」と手動操作を頼まない。`./scripts/dev-loop.sh normal/full` をBashで自動実行する
- サブエージェント（実装系）もCC上で新規ファイルを書かない。Cursor経由が原則
- 判断に迷ったらdev-loop normal
- ユーザーが明示的にキーワード指定した場合はそちらを優先
