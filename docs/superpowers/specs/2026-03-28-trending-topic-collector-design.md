# バズ語りネタ自動収集パイプライン 設計書

## 概要

YouTubeショート動画の「語りネタ」を5つのソースから毎日自動収集し、Obsidian Vaultに蓄積する。スコアの高いネタはLINE通知で即座に届ける。

## 背景

- 対象: 櫻子チャンネル（@827rakrp、登録者30万人、顔出しなしショート動画）
- 動画スタイル: 映像（料理/マイクラ/景色/AI生成/顔出し独語など）+ 語り
- 課題: 語りのネタ探しが属人的。バズっているトピックを体系的に拾う仕組みがない
- ゴール: ネタ会議で使える「バズトピックのストック」を自動で溜める

## アーキテクチャ

```
[Cron / 1日2回（朝9時/夜21時）]
    │
    ├── Yahoo知恵袋クローラー
    ├── Xトレンドクローラー
    ├── YouTube Shortsクローラー
    ├── Reddit/海外反応クローラー
    └── はてな匿名ダイアリークローラー
    │
    ▼
[スコアリング] ← 「語りネタ適性」を判定（100点満点）
    │
    ▼
[Obsidian Vault保存] ← ノート化 + QMDインデックス更新
    │
    ▼
[LINE通知] ← スコア70点以上を全件送信（リンク付き）
```

## 技術スタック

- ランタイム: Python 3.11+
- 定期実行: cron（ローカル）or Cloudflare Workers（Cron Triggers）
- 保存先: ~/Documents/Obsidian Vault/knowledge/trending-topics/
- 通知: LINE Notify or LINE公式アカウント経由
- スコアリング: ルールベース（将来的にLLM判定も検討）

## 収集ソース詳細

### 1. Yahoo知恵袋

- 対象カテゴリ: 恋愛相談/人間関係/海外生活/仕事/家族/生き方
- 収集方法: カテゴリ別「閲覧数順」のHTMLスクレイピング（API不要）
- フィルタ: 閲覧数1万以上、回答3件以上、直近48時間
- 取得項目: 質問タイトル/本文冒頭/閲覧数/回答数/カテゴリ/URL
- 1回あたり上限: 各カテゴリ上位20件チェック → スコア50以上を保存

### 2. X (Twitter)

- 収集方法: 検索スクレイピング（Nitter系 or 直接）
- 検索クエリ例:
  - `("海外あるある" OR "海外生活" OR "国際結婚" OR "外国人彼氏") min_faves:5000`
  - `("共感" OR "わかる" OR "それな") min_faves:10000`
  - `("どう思う" OR "これってあり" OR "モヤモヤ") min_faves:5000`
- フィルタ: 5000いいね以上、リプ100以上、直近48時間
- 取得項目: ツイート本文/いいね/RT/リプ数/URL

### 3. YouTube Shorts

- 対象: 語り系/あるある系の競合チャンネルをリスト管理（10-20チャンネル）
- 収集方法: YouTube Data API v3（チャンネル最新動画取得）
- フィルタ: 60秒以下、再生数10万以上、直近48時間
- 取得項目: タイトル/再生数/いいね/コメント数/URL
- API コスト: 無料枠10,000クォータ/日で十分（1チャンネル取得=約3クォータ）

### 4. Reddit / 海外反応

- 対象サブ: r/japan, r/japanlife, r/AskReddit, r/tifu, r/AmItheAsshole
- 海外反応まとめ: パンドラの憂鬱、海外の反応アンテナ等のRSS
- 収集方法: Reddit JSON API（認証不要、.json suffix）+ RSSパース
- フィルタ: upvote 500以上、直近48時間
- 取得項目: タイトル/本文冒頭/upvote/コメント数/URL

### 5. はてな匿名ダイアリー

- 収集方法: はてなブックマーク人気エントリーAPI（anond.hatelabo.jp）
- フィルタ: ブクマ100以上、直近48時間
- 取得項目: タイトル/本文冒頭/ブクマ数/URL

## スコアリング

100点満点。2軸で評価。

### バズ度（60点）

各ソースのエンゲージメントを0-60に正規化:

| ソース | 20点 | 40点 | 60点 |
|--------|------|------|------|
| 知恵袋 | 閲覧1万 | 閲覧5万 | 閲覧10万+ |
| X | いいね5千 | いいね2万 | いいね5万+ |
| YouTube | 再生10万 | 再生50万 | 再生100万+ |
| Reddit | upvote 500 | upvote 2000 | upvote 5000+ |
| はてな | ブクマ100 | ブクマ500 | ブクマ1000+ |

線形補間で中間値を算出。

### 語りネタ適性（40点）

キーワードマッチで加点:

- 感情ワード含む: +10（怒り/悲しみ/驚き/感動/モヤモヤ/衝撃）
- 問いかけ形式: +10（「〜どう思う？」「〜ってあり？」「〜なんだけど」）
- 人間関係テーマ: +10（恋愛/家族/職場/友人/国際/文化）
- 議論が割れている: +10（賛否両論の指標 = コメント/回答のバラつき）

### スコア閾値

- 70点以上: Obsidian保存 + LINE通知（全件）
- 50-69点: Obsidian保存のみ
- 49点以下: 保存しない

## Obsidian保存フォーマット

パス: `~/Documents/Obsidian Vault/knowledge/trending-topics/YYYY-MM-DD-{slug}.md`

```markdown
---
title: "彼氏が海外赴任 ついていくべき？"
source: chiebukuro
score: 82
category: 恋愛/海外生活
collected_at: 2026-03-28T09:00:00
url: https://detail.chiebukuro.yahoo.co.jp/...
engagement:
  views: 85000
  answers: 47
tags: [trending-topic, chiebukuro, 恋愛, 海外]
---

## 元ネタ要約

（質問/ツイート/投稿の要約2-3行）

## 語りネタとしてのポイント

- なぜバズったか
- 賛否の割れ方
- 切り口案
```

1回あたりの保存上限: 各ソース最大10件 = 最大50件/回。スコア50以上のみ。

## LINE通知フォーマット

スコア70以上を全件送信。1日2回（収集直後）。

```
[バズネタ速報 5件]

82点 彼氏が海外赴任 ついていくべき？
知恵袋 8.5万閲覧 47回答 | 恋愛×海外
https://detail.chiebukuro.yahoo.co.jp/...

75点 外国人に「日本の不思議」聞いたら全員同じ答え
Reddit 3200upvote | 海外あるある
https://www.reddit.com/r/japan/...

71点 職場で「それ言う？」って思った瞬間
はてな匿名 680ブクマ | 人間関係
https://anond.hatelabo.jp/...
```

0件のときは通知しない。

## 重複排除

- ソースURL単位でSQLite DBに記録
- 同一トピックの類似判定: タイトルの類似度（簡易的にはキーワード一致率、将来的にembedding）
- 過去30日以内に通知済みの類似トピックは除外

## ディレクトリ構成

```
trending-topic-collector/
├── src/
│   ├── collectors/
│   │   ├── chiebukuro.py
│   │   ├── twitter.py
│   │   ├── youtube_shorts.py
│   │   ├── reddit.py
│   │   └── hatena.py
│   ├── scorer.py
│   ├── obsidian_writer.py
│   ├── line_notifier.py
│   ├── dedup.py
│   └── main.py
├── config.yaml          # チャンネルリスト、検索クエリ、閾値等
├── data/
│   └── seen.db          # 重複排除用SQLite
├── requirements.txt
└── README.md
```

## 設定ファイル（config.yaml）

```yaml
schedule:
  times: ["09:00", "21:00"]
  timezone: "Asia/Tokyo"

freshness:
  max_age_hours: 48

scoring:
  notify_threshold: 70
  save_threshold: 50

sources:
  chiebukuro:
    enabled: true
    categories:
      - 恋愛相談
      - 人間関係
      - 海外生活
      - 仕事
      - 家族
      - 生き方
    min_views: 10000
    min_answers: 3

  twitter:
    enabled: true
    queries:
      - '"海外あるある" OR "海外生活" OR "国際結婚"'
      - '"共感" OR "わかる" OR "それな"'
      - '"どう思う" OR "これってあり" OR "モヤモヤ"'
    min_faves: 5000
    min_replies: 100

  youtube_shorts:
    enabled: true
    channels: []  # 初回セットアップ時に追加
    min_views: 100000
    max_duration_sec: 60

  reddit:
    enabled: true
    subreddits:
      - japan
      - japanlife
      - AskReddit
      - tifu
      - AmItheAsshole
    rss_feeds:
      - https://pandora11.com/feed
    min_upvotes: 500

  hatena:
    enabled: true
    min_bookmarks: 100

notification:
  line:
    enabled: true
    # token: 環境変数 LINE_NOTIFY_TOKEN で指定

obsidian:
  vault_path: "~/Documents/Obsidian Vault"
  output_dir: "knowledge/trending-topics"
```

## 今後の拡張（スコープ外）

- LLMによるスコアリング精度向上（感情分析、議論割れ判定）
- 収集トピックから台本ドラフト自動生成
- 櫻子チャンネルの過去動画との類似度チェック（被りネタ検出）
- Instagram Reels URLの自動紐付け（トピック→関連リール検索）
