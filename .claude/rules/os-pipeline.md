---
description: 業務OSパイプラインのデータフロー・audit・approval定義
alwaysApply: false
globs:
  - "**/os/modules/**"
  - "**/os/tenants/**"
---

# 業務OSパイプラインルール

## データフロー

入力 → classifier → モジュール → audit → approval → notify → archive

## classifier 分類基準

- LINE Webhook → デフォルト inquiry
- 手動指示 → キーワードで判定（料金/見積→inquiry、調べて→research、記事→content等）
- Cron → デフォルト analysis

## audit 必須チェック

1. 禁止ワード: テナントの `context.yaml#prohibited` に定義されたワードを検出
2. 料金一致: ドラフト内の金額が `context.yaml#pricing` と一致するか検証
3. CTA有無: 100文字以上の返信にはCTAが含まれているか確認

## approval が必要なケース

- 料金に関する回答（金額の正確性）
- 入金確認・予約確定に関する返信
- キャンセル・返金対応
- 契約条件の変更

## テナント設定の読み込み順序

1. `os/modules/{mod}/config.yaml` でデフォルト値を読む
2. `os/tenants/{tenant}/context.yaml` で事業コンテキストを読む
3. `os/tenants/{tenant}/{mod}.yaml` が存在すればフィールド単位で上書き

## Hooks 連携

- PreToolUse: LINE送信前に `audit()` を実行。エラーがあれば送信をブロック
- PostToolUse: 問い合わせ返信後に知識DB投入チェック
