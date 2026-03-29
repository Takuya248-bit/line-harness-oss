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

## カテゴリ体系

| category | 内容 | subcategory例 |
|----------|------|---------------|
| bali_area | バリ島エリア情報 | canggu, ubud, seminyak, kuta, kerobokan |
| study_faq | バリ留学FAQ | beginner_ok, one_week, dorm_life, making_friends |
| barilingual | バリリンガル固有 | mantooman, dorm, teachers, student_types, common_worries |
| english_learning | 英語学習 | beginner_mistakes, speaking, aizuchi, paraphrase, natural_english |
| evidence | 実例・エピソード | first_3days, one_week_change, real_scene, outside_class |
| lstep | Lstep操作・設定ノウハウ | scenario, template, tag, reminder, gui_pattern |
| line_official | LINE公式アカウント運用 | messaging_api, richmenu, webhook, segmentation |
| lcustom | Lカスタム（LINE構築代行）事業 | pricing, sales, client_case, pitch, onboarding |
| seo | SEO・コンテンツマーケ | keyword, ranking, geo, article_structure |
| tech | 技術知見 | cloudflare, d1, workers, playwright, api_cost |
| marketing | マーケティング全般 | sns_trend, engagement, ad, funnel |
| business | 事業運営・経営 | cost, pricing, competitor, partnership |

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
