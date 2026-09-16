# バリリンガル Telegram CS Bot 設計書
date: 2026-04-05

## 概要

バリリンガルのLINE公式アカウントに届いた問い合わせを、Telegram経由で半自動返信する仕組み。
Gemini 2.0 Flashがドラフトを生成し、オーナーがTelegramで承認/修正指示を出してLINEに送信する。
やり取りを蓄積して精度を継続的に向上させる。

## フロー

```
LINEメッセージ受信
  ↓
Gemini 2.0 Flashでドラフト生成
  （context.yaml + 過去5件の会話履歴 + 過去承認ドラフトfew-shot）
  ↓
Telegramに通知
  （受信メッセージ + ドラフト + ボタン）
  ↓
  ┌─ 承認して送信 → LINEに送信 → 保存
  ├─ 修正指示    → 指示入力（force_reply）→ Geminiが再生成 → 再確認
  └─ スキップ    → 何もしない
  ↓
最終承認後、inquiry_correction_logに保存
  （元メッセージ + 指示 + 最終ドラフト + intent_type）
```

## 技術構成

- 実行基盤: 既存 Cloudflare Worker (line-crm-worker)
- ドラフト生成: Gemini 2.0 Flash（Groqから変更）
- 通知: Telegram Bot API（Discordを廃止）
- Telegram Webhook: Worker内 `/telegram/webhook` エンドポイント

## 新規ファイル

| ファイル | 役割 |
|---|---|
| `src/services/gemini-draft.ts` | Gemini API呼び出し・プロンプト構築 |
| `src/services/telegram-notify.ts` | Telegram通知・ボタン送信 |
| `src/routes/telegram-webhook.ts` | ボタンクリック/返信ハンドラ |

## 既存ファイルの変更

| ファイル | 変更内容 |
|---|---|
| `src/routes/webhook.ts` | Groq→Gemini切替、Discord→Telegram切替 |
| `src/index.ts` | `/telegram/webhook` ルート追加 |
| `wrangler.toml` | TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 追加 |

## プロンプト設計

### コンテキスト注入（優先順）
1. context.yaml の料金・コース・FAQ情報
2. 同ユーザーの過去5件の会話履歴
3. 同じintent_typeの過去承認ドラフト（最大3件、few-shot）
4. フェーズ戦略（tone / focusAreas / CTA）

### 修正指示ループ
- オーナーが「もっと柔らかく」「CTAを外して」などの指示を入力
- Geminiが指示+元ドラフトをもとに再生成
- 再生成後、再度確認画面を表示
- 最大3回まで再生成可能

## 学習データ（inquiry_correction_logの活用）

### 保存タイミング
- 承認時: instruction=null, original_draft=final_draft
- 修正指示後承認時: instruction=指示文, original_draft, final_draft

### few-shot活用
- 次回同じintent_typeのメッセージが来たとき、過去の承認ドラフトを最大3件プロンプトに注入
- 修正指示があったケースは「悪い例→修正指示→良い例」としてセットで注入

## 環境変数（追加）

| 変数名 | 値 |
|---|---|
| TELEGRAM_BOT_TOKEN | 8631492499:AAEPSLLD_62u7mXO7iz9SMgL0ryBLF8lv2Q |
| TELEGRAM_CHAT_ID | 7745195756 |
| GEMINI_API_KEY | （要取得） |

## 段階的な自動化方針

- Phase 1（今回）: 全件Telegram確認。人間が承認/修正
- Phase 2（3ヶ月後）: confidence > 0.9 かつ intent_type が既知パターンのみ自動送信
- Phase 3: 自動送信比率を段階的に拡大

## 完了条件

- LINEにメッセージが来るとTelegramに通知が届く
- 承認ボタンでLINEに返信が送信される
- 修正指示→再生成→承認が動作する
- inquiry_correction_logに保存される
- Discordへの通知が削除されている
