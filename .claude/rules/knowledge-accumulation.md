---
description: リサーチ・CS完了時に知識DBへ自動蓄積するルール
alwaysApply: true
---

# 知識DB自動蓄積ルール（全作業対象）

全てのエージェントは、作業中に得た再利用可能な情報を知識DBに投入する。
対象はバリ/英語に限らず、全事業・全領域の知識。使うほど賢くなるDBを育てる。

## 蓄積トリガー（全作業が対象）

作業完了時に「この情報は次回以降も使えるか？」を判断し、YESなら投入する:
- リサーチ・調査で得た事実・数字・比較
- CS対応で判明したFAQ・よくある質問・顧客の声
- オーナーが会話中に共有した体験談・観察・数字
- 生徒フィードバック・顧客の反応
- Lstep/LINE構築で得たノウハウ・設定値・ベストプラクティス
- GUI自動操作で発見したUIパターン・制約・回避策
- SEO/マーケで得た競合情報・キーワード・トレンド
- 技術実装で得た知見・APIの挙動・コスト実績
- 料金・コスト・見積もりの実績値
- クライアント案件で得た業種別の知見

## 投入方法

```bash
curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{"category":"...","subcategory":"...","title":"...","content":"...","tags":"...","source":"...","reliability":"..."}'
```

## カテゴリ体系（知識の性質ベース、事業非依存）

| category | 何の知識か | subcategory例 |
|----------|-----------|---------------|
| market | 市場・統計・トレンド・業界動向 | study_abroad, line_market, ai_market, sns_trend |
| technology | 技術・ツール・API・PF仕様 | line_api, cloudflare, llm, lstep, playwright |
| method | ノウハウ・手法・ベストプラクティス | seo, english_speaking, line_automation, content_creation |
| case | 事例・実績・Before/After | barilingual_student, lcustom_client, competitor |
| locale | 地域・生活・文化・制度 | bali_area, bali_visa, bali_cost, bali_cafe |
| people | 顧客の声・FAQ・行動パターン | barilingual_student, lcustom_client, common_worry |
| ai_news | AI・LLM・自動化の最新動向 | model_release, api_pricing, use_case |
| regulation | 法律・規制・ガイドライン | tokushoho, keihin, privacy, platform_tos |

## source / reliability

| source | 意味 | reliability初期値 |
|--------|------|-------------------|
| firsthand | オーナーの体験・観察 | verified |
| student_feedback | 生徒の声 | verified |
| client_feedback | クライアントの声 | verified |
| observation | 現地観察・実測 | verified |
| research | サブエージェントの調査 | unverified |
| auto | 自動蓄積 | unverified |
| experiment | 実験・ABテスト結果 | verified |

## 蓄積する内容のルール

- 事実・数字・観察・実例・ノウハウを貯める。きれいな文章は貯めない
- 1回のPOST = 1つの事実（粒度を細かく）
- 既存エントリと重複する内容は投入しない
- 不確かな情報はreliability: unverifiedで投入
- カテゴリが既存にない場合は最も近いものを使う。頻出なら新カテゴリ追加を提案

## 蓄積しない内容

- 意思決定（decisions.mdに記録）
- 作業ログ（progress.mdに記録）
- 一時的な調査の中間結果
- 個人情報・認証情報
