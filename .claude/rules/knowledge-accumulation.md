# 知識DB自動蓄積ルール

リサーチ・CS対応・コンテンツ作業の完了時、得られた一次情報を知識DBに投入する。

## 蓄積トリガー

以下の作業完了時に、得られた事実・数字・体験をDBに投入する:
- リサーチ系サブエージェントの調査完了時
- CS対応で新しいFAQ・よくある質問パターンが判明した時
- オーナーが会話中に一次情報（体験談・観察・数字）を共有した時
- 生徒フィードバックの入力時

## 投入方法

```bash
curl -s -X POST https://ig-auto-poster.archbridge24.workers.dev/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "category": "カテゴリ",
    "subcategory": "サブカテゴリ",
    "title": "短いタイトル",
    "content": "事実・数字・観察（文章ではなく素材）",
    "tags": "tag1,tag2",
    "source": "ソース種別",
    "reliability": "信頼度"
  }'
```

## カテゴリ体系

| category | 内容 | subcategory例 |
|----------|------|---------------|
| bali_area | バリ島エリア情報 | canggu, ubud, seminyak, kuta, kerobokan |
| study_faq | バリ留学FAQ | beginner_ok, one_week, dorm_life, making_friends |
| barilingual | バリリンガル固有 | mantooman, dorm, teachers, student_types, common_worries |
| english_learning | 英語学習 | beginner_mistakes, speaking, aizuchi, paraphrase, natural_english |
| evidence | 実例・エピソード | first_3days, one_week_change, real_scene, outside_class |

## source / reliability

| source | 意味 | reliability初期値 |
|--------|------|-------------------|
| firsthand | オーナーの体験・観察 | verified |
| student_feedback | 生徒の声 | verified |
| observation | 現地観察 | verified |
| research | サブエージェントの調査 | unverified |
| auto | 自動蓄積 | unverified |

## 蓄積する内容のルール

- 事実・数字・観察・実例を貯める。きれいな文章は貯めない
- 1回のPOST = 1つの事実（粒度を細かく）
- 既存エントリと重複する内容は投入しない
- 不確かな情報はreliability: unverifiedで投入

## 蓄積しない内容

- 意思決定（decisions.mdに記録）
- 作業ログ（progress.mdに記録）
- 一時的な調査の中間結果
- 他プロジェクト（Lカスタム等）固有の情報
