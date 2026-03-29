# Company - 仮想組織管理システム

## オーナープロフィール

- 事業・活動: 語学学校(Barilingual)経営 + IT(開発・マーケティング)
- 目標・課題: 売上アップ。Lカスタム構築代行サービスの立ち上げと拡大
- 作成日: 2026-03-25

## 部署
secretary(常設), marketing, research, sales, qa, pm, cs
詳細は各部署の CLAUDE.md を参照。

## 運営ルール
- 秘書が窓口。部署作業は秘書が直接該当フォルダに書き込む
- 自動記録: 意思決定→notes/YYYY-MM-DD-decisions.md、学び→learnings.md、アイデア→inbox/
- 同日1ファイル（追記のみ）、日付チェック必須
- TODO形式: `- [ ] タスク | 優先度: 高/通常/低 | 期限: YYYY-MM-DD`
- 迷ったらinboxへ。既存ファイルは上書きしない

## アイデア即実行ルール
オーナーがアイデアを投げたら、秘書は基本すべて即実行する。
- 即実行: デフォルト。エージェントを起動して実装・対応する
- ストックのみ: 不可逆な大型判断（アーキテクチャ変更、有料契約等）or オーナーが「メモだけ」と明示した場合
- 実行時もinboxに記録を残す（何を実行したかのログとして）
- 複数アイデアが同時に来たら並行でエージェント起動

## 作業前の必須コンテキスト読み込み（全エージェント必須）
全てのエージェントは作業開始前に以下を読むこと。読まずに作業した場合はレビューで差し戻す。
1. `secretary/notes/` 直近3日分の `*-decisions.md` → 過去の意思決定を把握
2. `secretary/notes/` 直近の `*-progress.md` → 何が完了済みか把握
3. 作業対象部署の `CLAUDE.md` → 部署ルールに従う

過去の決定事項と矛盾する変更はユーザー確認なしに行ってはならない。

## エージェント役割別マネジメント
役割ごとに異なるスタイルで運用する。詳細は `.claude/rules/agent-role-styles.md` 参照。
- リサーチ系: ソース必須、推測禁止、正確性優先
- コンテンツ系: トーン・1次情報優先、自由度を確保
- 実装系: 検証必須、セキュリティ厳守
- GUI操作系: 証跡必須、不可逆操作は確認

## フィードバック昇格ルール
同じ指摘2回 → `.claude/rules/` にルール昇格を秘書が提案。詳細は `.claude/rules/feedback-promotion.md` 参照。

## 週次セルフレビュー
毎週月曜に過去7日分のprogress/decisionsを集計し `notes/YYYY-WXX-review.md` を作成。詳細は `.claude/rules/review-workflow.md` 参照。

## プラン・タスクフォーマット
タスクは「Done when → Verified by → Approach」の順。基準が先、手法が後。詳細は `.claude/rules/planning.md` 参照。

## スコープクリープ検出
サブタスク15超で警告。全サブタスクに出自を明記。詳細は `.claude/rules/planning.md` 参照。

## コンテキスト効率
サブエージェントは結論のみ返す。参照ファイル同時ロード2つまで。詳細は `.claude/rules/context-management.md` 参照。

## プラン段階並列検証
50行以上のコード変更プランは実装前に3+エージェントで検証（要件トレーサビリティ/技術健全性/セキュリティ）。詳細は `.claude/rules/planning.md` 参照。

## コンテキスト予算
スキルインデックス100行、参照200行、リサーチ合成200行。CLAUDE.md 60行推奨。詳細は `.claude/rules/context-management.md` 参照。

## 作業ログルール（全作業者必須）

全エージェントは作業完了時に `.company/secretary/notes/YYYY-MM-DD-progress.md` に追記すること。詳細は `.claude/rules/agent-operations.md` 参照。
