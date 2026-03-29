# cooking-sfx-bot: 料理ショート動画 SE自動挿入 LINE Bot

## 概要

LINEで料理動画を送るとSEを自動挿入した動画が返ってくるBot。対話的に調整可能。SE素材もLINEから追加できる。

## ユーザー

櫻子さん（YouTuber、スマホのみ使用）

## ユースケース

### 動画にSE挿入
```
櫻子: (動画送信)
Bot: SE付きプレビュー動画 + タイムライン表示
     「0.0s クリック / 2.0s 包丁 / 5.0s 注ぐ / ...」

櫻子: 「5秒の音消して」
Bot: → 該当SE削除して再生成、返信

櫻子: 「25秒にぷにぷに追加」
Bot: → SE追加して再生成、返信

櫻子: 「OK」
Bot: 「保存しました」
```

### SE素材追加
```
櫻子: 「SE追加」
Bot: 「音声か動画を送ってください」
櫻子: (音声/動画送信)
Bot: 「カテゴリは？ 切る/混ぜる/注ぐ/演出/リアクション」
櫻子: 「切る」
Bot: 「cutting/new_cut_01.wav として追加しました」
```

### SE一覧確認
```
櫻子: 「SE一覧」
Bot: 「cutting: houchou_cut, knife_cut_short
      mixing: kakimazeru, kakimazeru_long
      pouring: awa, ekitai_sosogu
      ...」
```

## アーキテクチャ

```
櫻子のiPhone
  ↓ LINE (動画/テキスト送信)
LINE Messaging API (Webhook)
  ↓ HTTPS POST
Fly.io (Docker: Python + ffmpeg)
  ├── app.py (Flask/FastAPI, Webhook受信)
  ├── pipeline/
  │   ├── extract_frames.py    # ffmpeg 4fps フレーム抽出
  │   ├── detect_scenes.py     # フレーム差分でシーン切替検出
  │   ├── classify_scenes.py   # Gemini Flashでシーン分類
  │   ├── select_sfx.py        # カテゴリ別SE選択（重複回避）
  │   └── render_sfx_track.py  # ffmpegでSE合成
  ├── assets/sfx/              # SE素材（persistent volume）
  │   ├── cutting/
  │   ├── mixing/
  │   ├── pouring/
  │   ├── intro/
  │   ├── reaction_happy/
  │   ├── reaction_surprise/
  │   ├── text_emphasis/
  │   ├── transition/
  │   └── misc/
  └── sessions/               # 処理中タイムライン保持（一時）
      └── {user_id}_{timestamp}.json
  ↓
LINE Messaging API (リプライ、無料・無制限)
```

## 処理フロー

### 1. 動画受信→SE挿入（初回）
1. Webhook受信、動画をダウンロード（LINE Content API）
2. ffmpegでフレーム抽出（4fps, 128px幅）
3. フレーム間差分でシーン切り替えポイント検出（diff > 25）
4. Gemini 2.0 Flashにフレーム群を送信、シーン分類
5. 分類結果 + 切り替えポイントからSEタイムライン生成
6. SE選択ルール適用:
   - 冒頭は必ずマウスクリック音
   - 切る/注ぐ/混ぜるは動作タイミングに合わせる
   - 物が横から入る→transition系SE
   - 長いシーン（5秒以上）→短いSEリピート or 長SE
   - SE間最低1.0秒間隔
   - 直前2つと同じSEファイルは回避
   - 最後は「うまい」
7. ffmpegでSEトラック生成（チェーン方式amix、normalize=0）
8. 元動画 + SEトラック合成
9. タイムラインをsession JSONに保存
10. LINEにリプライ: SE付き動画 + タイムラインテキスト

### 2. 調整（再生成）
1. テキストメッセージ受信（「5秒の音消して」等）
2. session JSONからタイムラインを読み込み
3. Gemini Flashでテキスト→タイムライン操作に変換:
   - 「5秒の音消して」→ timestamp 5.0 のエントリ削除
   - 「25秒にぷにぷに追加」→ timestamp 25.0 に punipuni.wav 追加
   - 「切る音大きく」→ cutting系のvolume_db +3
4. タイムライン更新、ffmpegで再合成（Geminiシーン分類不要）
5. LINEにリプライ

### 3. SE素材追加
1. 「SE追加」テキスト受信 → 状態を「SE追加待ち」に
2. 音声/動画ファイル受信 → ffmpegでwav変換（44100Hz, mono）
3. カテゴリ選択を促す（テキスト or クイックリプライボタン）
4. カテゴリ指定 → persistent volumeのassets/sfx/{category}/に保存

## SE配置ルール（Gemini Flashプロンプト）

```
あなたは料理ショート動画の効果音エディターです。
以下のフレーム画像は料理動画から0.25秒間隔で抽出したものです。

各シーンを以下のカテゴリに分類し、効果音を配置してください:
- cutting: 包丁・ハサミで切る
- mixing: 泡立て器・スプーンで混ぜる
- pouring: 液体を注ぐ・粉を入れる
- intro: 食材の提示・冒頭
- plating: 盛り付け
- closeup_food: 完成品のアップ
- transition: 物が横から入る・シーン転換
- text_emphasis: テロップ強調
- reaction: リアクション

ルール:
- 連続する同じカテゴリは1区間にまとめる
- 動作の開始タイミングを正確に指定する
- confidenceを付ける（0.0-1.0）

JSON配列で返してください:
[{"start": 秒, "end": 秒, "event": "カテゴリ", "confidence": 数値}]
```

## セッション管理

- session JSON: `/sessions/{user_id}_{timestamp}.json`
- 保持内容: タイムライン、元動画パス、SE配置情報
- TTL: 1時間（古いセッションは自動削除）
- 新しい動画を送信 → 前のセッションは破棄

## 技術スタック

| コンポーネント | 技術 |
|-------------|------|
| 言語 | Python 3.11 |
| Webフレームワーク | FastAPI |
| 動画処理 | ffmpeg |
| シーン分類 | Gemini 2.0 Flash API |
| 調整指示の解釈 | Gemini 2.0 Flash API |
| フレーム分析 | Pillow + NumPy |
| LINE連携 | line-bot-sdk (v3) |
| ホスティング | Fly.io (Docker) |
| SE保存 | Fly.io persistent volume (1GB) |
| 一時ファイル | /tmp（処理後削除） |

## コスト

| 項目 | 単価 | 月間見積もり（30動画/月） |
|------|------|----------------------|
| Fly.io | 無料枠 | 0円 |
| Gemini Flash | 約0.5円/動画 | 約15円 |
| LINE リプライ | 無料・無制限 | 0円 |
| 合計 | | 約15円/月 |

## 制約・前提

- LINE動画送信上限: 25MB（60秒以内のショート動画なら十分）
- 処理時間: 初回15-30秒、調整時5-10秒
- Fly.io無料枠: shared-cpu-1x, 256MB RAM（ffmpegは動くがギリギリ）
- V1のシーン分類精度: 80%目標、調整機能で補完
- 同時処理: 1リクエストずつ（櫻子さん1人なので十分）
- 声入りSE（おはよー等）は使わない。アクション音のみ

## 将来の拡張（V2以降）

- SE精度向上（音声波形分析との併用）
- SEプリセット（和食・洋食・お菓子等のジャンル別）
- 複数ユーザー対応（他のYouTuberにも提供）
- BGM自動挿入
- テロップ自動挿入との統合
