
## ブラウザ自動操作のアーキテクチャ方針

決定: ブラウザ操作はClaude Code非依存の独立スクリプト(Puppeteer/Playwright)で実行する
理由: Claude Codeのトークン消費を避けるため。定型操作にLLMは不要
変更内容:
- agent-role-styles.md: スクリーンショット証跡 → DOMログ(JSON)証跡に変更
- lstep-automationスキル: standalone-execution.md 参照ドキュメント追加
- Claude Codeの役割は「スクリプト起動+結果判断」のみ
- 定期実行はcron/GH Actionsで、異常時のみエスカレーション
- Lightpanda(Zig製ヘッドレスブラウザ)は将来的にPuppeteerのランタイム差替として検討。現時点では見送り（SPA互換性未検証、スクリーンショット非対応）

## 18:17 開発ループ・ツール分担の決定

### Playwright vs Computer Use
- 決定: Playwrightを実行エンジンとして継続。Computer Useはデバッグ補助のみ
- 理由: Playwrightはverify済みアクションの再利用性が高く、トークン効率が60倍良い。クライアント案件が増えるほど投資回収できる

### 3ツール分担
- 決定: Claude Code=設計・判断 / Codex exec=実装 / Codex review=独立レビュー
- 理由: 実装と設計の分離+異なるLLMによるレビューで品質向上。dev-loopスキルで自動化済み

### dev-loop 3モード
- 決定: quick(レビューのみ) / normal(実装+レビュー) / full(実装+レビュー+修正ループ)
- 理由: 小修正にfullループは非効率（6行の変更に122Kトークン消費した実測値から）

### Chrome操作ルール
- 決定: Chromeの強制終了・プロファイル削除は絶対禁止
- 理由: ユーザーのログイン情報・拡張機能・ブックマークが失われるため。CDPが必要な場合はユーザーに再起動を依頼

## 21:30 開発ワークフロー分担の変更

### 5ステップ開発ループ
- 決定: Claude Code=設計・判断 / Cursor=実装・修正 / Codex=レビュー の3ツール5ステップ体制に変更
- 旧: Claude Code=設計 / Codex exec=実装 / Codex review=レビュー
- 新: ① Claude Code設計 → ② Cursor実装 → ③ Codex review → ④ Claude改善指示 → ⑤ Cursor修正
- 理由: Cursorは対話的IDE実装に強く、Codexはヘッドレスレビューに特化。役割が明確に分離
- 最優先ルール化: コード変更は必ずdev-loopを通す。Claude Codeが10行超の実装を自分で書かない
- dev-loopスキル・スクリプト・auto-routing.md を全て更新済み
