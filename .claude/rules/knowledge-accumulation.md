---
description: リサーチ・CS完了時に知識DBへ自動蓄積するルール
alwaysApply: false
globs:
  - "**/scripts/knowledge-add.mjs"
---

# 知識DB自動蓄積ルール

作業完了時に「この情報は次回以降も使えるか？」を判断し、YESならNotionに投入する。

投入コマンド: `node scripts/knowledge-add.mjs <category> <subcat> <title> <content> [tags] [source] [reliability]`
カテゴリ: market / technology / method / case / locale / people / ai_news / regulation / education
source: firsthand / student_feedback / client_feedback / observation / research / auto / experiment

## educationカテゴリ（留学・英語・バリ生活）

バリリンガルのXアカウント投稿ネタとして蓄積する。AI系(Lカスタム)とは完全に分離。

subcategory例: study_abroad / english_learning / bali_life / student_voice / school_comparison
tags例: 留学, 英語, バリ, フィリピン留学, TOEIC, 費用, 体験談, 生活情報

自動蓄積トリガー:
- CS対応完了時: 留学検討者のよくある質問・不安・決め手をナレッジ化（source: client_feedback）
- リサーチ完了時: 留学市場・英語学習トレンド・競合情報を投入（source: research）
- 生徒フィードバック: 卒業生の声・成果をナレッジ化（source: student_feedback）
- オーナー体験: バリ生活・学校運営のリアル情報（source: firsthand）

蓄積対象: リサーチ結果、FAQ、体験談・数字、顧客FB、技術知見、料金実績、競合情報、留学情報
蓄積しない: 意思決定(→decisions.md)、作業ログ(→progress.md)、中間結果、個人情報
詳細カテゴリ・subcategory一覧は /knowledge-add スキル参照。
