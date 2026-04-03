## 10:51 IG投稿コンテンツ方針

### 直接宣伝なし・Tips型コンテンツ
- 決定: リール/フィードでバリリンガルの直接宣伝はしない。バリ島Tips・英語学習Tipsで価値提供→CTAでLINE登録に誘導
- 理由: コンテンツマーケティングの基本。価値提供→信頼構築→ソフトCTA

### TTP（徹底的にパクる）戦略
- 決定: オリジナルフォーマットは作らない。バズっている英語学習チャンネル・インフルエンサーの台本構成パターンを分析し、フォーマットを模倣。中身だけNotion知識DBのネタに差し替え
- フォーマットDB: Notion Buzz Formats DB（ID: 3357301d-e145-81fc-9cc7-cfd6aad9292d）に蓄積
- バズフォーマット10パターン: 知ってた系、あるある系、やってみた系、vs比較系、ランキング系、クイズ系、衝撃事実系、Before/After系、文化差分系、ネイティブ検証系

### リサーチツール見直し
- 決定検討中: リサーチをClaude subagentからPerplexity APIに移行
- 理由: コスト1/50（$0.25/回→$0.005/回）、引用付き、品質同等
- ツール分担案: Claude Code=設計判断、Perplexity=リサーチ、Cursor=実装、Codex=レビュー
## Notion統合方針の決定

決定: 移行可能なデータをNotionに集約するハイブリッド構成を採用
- Notionに移行: ナレッジDB(既存)、Content Pipeline(ネタDB)、CS Cases DB、シナリオ設計ドラフト
- D1に残す: CRMデータ(友だち・タグ)、Webhook処理、リアルタイムシナリオ実行
- 同期: Notion→Obsidian日次同期(QMD検索用)、Notion→CSV→D1(シナリオ設計)
理由: Notion APIのレイテンシ(200-500ms)とレートリミット(3req/sec)はリアルタイム処理に不向き。管理・企画層はNotion、実行層はD1の使い分けが最適

## 16:36 バリリンガル カード決済導入

### Stripe Payment Links採用
- 決定: 留学費用のカード決済にStripe Payment Linksを採用
- 手数料3.6%は価格に上乗せ（振込価格 / 0.964、100円単位切り上げ）
- 銀行振込は従来価格で併用
- 分割払いはカード会社側の機能に任せる（Stripe側では提供しない）
- 開発なし。Stripe管理画面で決済リンク作成→LINEで送信
- 理由: 開発ゼロ、金額上限なし、将来LINE Harness連動も可能
- 設計書: docs/superpowers/specs/2026-04-02-barilingual-card-payment-design.md
