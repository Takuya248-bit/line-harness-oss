
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
