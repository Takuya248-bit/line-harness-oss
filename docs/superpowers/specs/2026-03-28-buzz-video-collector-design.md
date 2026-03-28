# 櫻子バズネタ収集システム v2 設計書

## 概要

ショート動画PF（IG Reels / YT Shorts）からバズ動画を自動収集し、Gemini Flashでネタ分類+フォーマット分析を行い、櫻子の語りネタ候補として蓄積する。

## 背景

- 櫻子チャンネル（酒と旅ゆく櫻子チャン、登録者30万人）のバズ動画ネタを効率的に集めたい
- 動画の本質は「二重構造」: 映像=料理（撮りため背景）、音声=語りネタ（本体）
- テキストPF（知恵袋/はてな/Reddit）からの流用は伸びた実績なし → ショート動画に限定
- オーナーはバリ在住。100均/コンビニ商品は入手不可
- 台本492本分析による「櫻子プロファイル」を策定済み（sakurako-profile.md）

## 収集対象

ショート動画のみ。優先度: IG Reels > YT Shorts >>> TikTok（将来）

### 収集データ（1動画あたり）
- URL
- 再生数 / いいね数
- キャプション（テキスト）
- スクリーンショット（フォーマット分析用）
- 投稿日（最近でなくてもOK）

## アーキテクチャ

```
[IG Reels収集] ──┐
                  ├→ [正規化] → [Gemini Flash判定] → [Obsidian保存]
[YT Shorts収集] ──┘         (ネタTier分類          → [LINE通知]
                             フォーマット分類         → [CSV(任意)]
                             スコアリング)
```

## 収集レイヤー

### IG Reels（最優先）
- Playwright + ログイン済みブラウザ（.pw-profile）
- ハッシュタグ / アカウント巡回 → /p/ URL収集
- yt-dlp 5並列でメタデータ取得（URL、いいね、再生数、キャプション）
- スクショ自動保存（フォーマット分析用）
- 日本語コンテンツ確保: アカウントリスト巡回方式（バリからのおすすめフィードは日本語が少ないため）

### YT Shorts（次点）
- YouTube Data API v3
- 無料枠: 10,000ユニット/日（search=100ユニット → 100回検索/日で十分）
- チャンネルリスト + キーワード検索
- メタデータ: タイトル、再生数、いいね、コメント数、サムネイル

### TikTok（将来）
- 未実装。優先度低
- 公式APIは審査必要。スクレイピング系ライブラリで対応予定

## Gemini Flash判定レイヤー

Google AI Studio経由。無料枠: 250 RPD、250,000 TPM。クレジットカード不要。超過時は429エラー（自動課金なし）。

5件バッチ判定。1日200件でも40リクエスト（上限の16%）。

### テキスト判定（キャプションから）
- Tier分類（1-4）
  - Tier 1: 共感/議論ネタ（コメント誘発力が最高）
  - Tier 2: 「知らなかった」系（保存率が高い）
  - Tier 3: エピソード素材（ストーリーの種）
  - Tier 4: 時事/トレンド乗っかり
- 語りネタ適性スコア（100点満点、5軸）
- ネタ要約（1行）

### 画像判定（スクショから）
- フォーマット分類: テロップ主体 / 手元料理 / 顔出しトーク / 風景Vlog / その他
- テロップ量: 多い / 普通 / 少ない
- 雰囲気タグ: おしゃれ / カジュアル / 情報系 / エンタメ

## スコアリング（5軸、100点満点）

キーワード正規表現からGemini Flash判定に置き換え。文脈を理解した判定に。

| 軸 | 配点 | 判定基準 |
|----|------|---------|
| コメント誘発力 | 30点 | 二択になるか、「自分なら」と言いたくなるか |
| 感情トリガー | 25点 | 共感/驚き/スカッと/軽い不快のどれか |
| 45秒語り適性 | 20点 | フック→展開→転換→オチが収まるか |
| 鮮度 | 15点 | 話題の旬。古くてもOKなので最低5点保証 |
| 櫻子視点 | 10点 | 海外在住/旅好き/OL経験のどれかに接点 |

## 出力レイヤー

| 出力先 | 条件 | 用途 |
|--------|------|------|
| Obsidian | 全件（50点以上） | ナレッジ蓄積（knowledge/buzz-videos/YYYY-MM/） |
| LINE通知 | 70点以上、朝1回デイリーサマリー | 櫻子への高スコアネタ共有 |
| CSV | --csvオプション | 分析/共有用 |

## フィードバックループ（C: 学習する仕組み）

将来実装。投稿した動画の再生数/エンゲージを追跡し、「このネタで作った動画がバズった/コケた」をスコアリングに反映する。

## 既存システムの扱い

| システム | 対応 |
|---------|------|
| trending-topic-collector | cron停止。コードは残す |
| ig-reels-research | v4ベースに書き直し、本システムのIG収集モジュールとして統合 |

## ディレクトリ構成

```
buzz-video-collector/
├── src/
│   ├── collectors/
│   │   ├── base.py           ← 共通インターフェース
│   │   ├── ig_reels.py       ← Playwright + yt-dlp
│   │   └── yt_shorts.py      ← YouTube Data API
│   ├── analyzer/
│   │   ├── gemini.py          ← Gemini Flash API呼び出し
│   │   ├── text_judge.py      ← ネタTier/スコア判定
│   │   └── visual_judge.py    ← スクショフォーマット分類
│   ├── output/
│   │   ├── obsidian.py
│   │   ├── line_notify.py
│   │   └── csv_export.py
│   ├── dedup.py
│   ├── config.py
│   └── main.py
├── config.yaml
├── data/
│   └── seen.db
├── screenshots/
└── requirements.txt
```

## コスト

- Gemini Flash: $0（無料枠内、250 RPD中40使用）
- YouTube Data API: $0（無料枠内、10,000ユニット/日）
- Playwright/yt-dlp: ローカル実行、$0
- 合計: $0/月

## 依存関係

- Python 3.11+
- playwright（IG Reels収集）
- yt-dlp（IGメタデータ取得）
- google-generativeai（Gemini Flash API）
- google-api-python-client（YouTube Data API、YT Shorts収集時）
- Obsidian Vault（出力先）

## 参照ドキュメント

- 櫻子プロファイル: Obsidian Vault/櫻子/YouTube/sakurako-profile.md
- リサーチルール: Obsidian Vault/櫻子/YouTube/research-rules.md
- 台本生成ルール: Obsidian Vault/youtube/00-台本生成ルール-md.md
