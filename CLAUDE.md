# line-harness プロジェクト

LINE Harness OSS (https://github.com/Shudesu/line-harness-oss) をベースにしたLINE公式アカウントCRM構築プロジェクト。

## 背景
- Lステップ(有料SaaS)からの脱却
- lstep-automationで蓄積したGUI自動操作の知見はスキル `/lstep-automation` に保存済み
- LINE Harness OSSはAPIネイティブのため、ブラウザ自動操作が不要

## 技術スタック
- API: Cloudflare Workers + Hono (TypeScript)
- DB: Cloudflare D1 (SQLite) - 42テーブル
- 管理画面: Next.js 15 (App Router) + Tailwind CSS
- LIFF: Vite + TypeScript
- SDK: TypeScript (ESM+CJS)
- 定期実行: Workers Cron Triggers (5分毎)

## セットアップ要件
- Node.js 20+, pnpm 9+
- Cloudflareアカウント
- LINE Developersアカウント (Messaging API + LINE Loginの2チャネル)

## コスト目安
- 5,000友だちまで: 無料 (Cloudflare無料枠)
- 10,000友だち: 約$10/月

## リポジトリ
- OSS本体: https://github.com/Shudesu/line-harness-oss
- ドキュメント: https://shudesu.github.io/line-harness-oss/
