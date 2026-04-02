# cooking-sfx-auto: 料理ショート動画 効果音自動挿入ツール

## 概要

料理のショート動画（スマホ撮影の生素材）を入力すると、シーンを自動検出し、各工程に適した効果音だけのwavトラックを出力するツール。出力wavをCapCutで動画に重ねて使う。

## 背景・動機

- 料理ショート動画の量産を目指している
- 編集はCapCutで行うが、効果音の選択・配置が手作業で時間がかかる
- シーン検出を自動化し、SE入りwavを生成することで編集時間を大幅短縮
- V1はCapCutで微調整する前提。将来的にはそのまま使える精度を目指す

## スコープ

### 含む

- 動画からのフレーム抽出
- Gemini 2.0 Flashによるシーン分類
- イベント別SE選択（重複回避ロジック付き）
- SE配置済みwavトラック合成（ffmpeg）
- 1コマンドでの全工程実行

### 含まない

- テロップ挿入（CapCutで対応）
- BGM挿入
- 動画の最終書き出し（CapCutで合成）
- SE素材の自動ダウンロード（手動でフォルダに配置）

## プロジェクト構成

```
cooking-sfx-auto/
├── scripts/
│   ├── extract_frames.py      # 動画からフレーム抽出
│   ├── classify_scenes.py     # Gemini Flashでシーン分類
│   ├── select_sfx.py          # イベント→SE選択（重複回避）
│   ├── render_sfx_track.py    # SE配置→wav合成（ffmpeg）
│   └── run_pipeline.py        # 全工程を1コマンドで実行
├── assets/
│   └── sfx/                   # イベント別フォルダにSEを格納
│       ├── cutting/
│       ├── frying/
│       ├── pouring/
│       ├── mixing/
│       ├── plating/
│       ├── intro/
│       ├── ending/
│       ├── closeup_food/
│       ├── ingredients_show/
│       ├── text_emphasis/
│       ├── reaction_surprise/
│       ├── reaction_fail/
│       └── reaction_happy/
├── config.json                # SE音量・間隔・API設定
├── out/                       # 出力wav + イベントJSON
└── requirements.txt
```

## データフロー

```
動画(mp4)
  → extract_frames.py
      ffmpegで2秒間隔のフレーム抽出
      256px幅にリサイズ（API転送量削減）
      tmp/{動画名}/frame_0000.jpg, frame_0002.jpg, ...

  → classify_scenes.py
      フレーム群をGemini 2.0 Flashに1リクエストでバッチ送信
      イベントJSON生成:
      [
        {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.92},
        {"start": 2.0, "end": 6.0, "event": "ingredients_show", "confidence": 0.88},
        {"start": 6.0, "end": 12.0, "event": "cutting", "confidence": 0.95},
        ...
      ]

  → select_sfx.py
      イベントごとにassets/sfx/{event}/からSEファイルを選択
      重複回避: 直前2つと同じファイルは除外
      confidence < 0.7 のイベントはSEスキップ
      出力: タイムライン付きSE配置JSON

  → render_sfx_track.py
      動画の長さに合わせた無音wavを生成
      各タイムスタンプにSEをffmpegでミックス
      SE音量はconfig.jsonのイベント別係数で調整

  → 出力:
      out/{動画名}_sfx.wav       (CapCutに読み込むSEトラック)
      out/{動画名}_events.json   (検出イベント一覧、微調整用)
```

## イベント定義

| イベント | 説明 | SE例 |
|---------|------|------|
| intro | 冒頭の挨拶・導入 | キラキラ、ジングル |
| ingredients_show | 材料を並べて見せる | ポップ音、シャキーン |
| cutting | 包丁で切る | トントン、サクッ |
| mixing | 混ぜる・こねる | グルグル、シャカシャカ |
| pouring | 注ぐ・入れる | トポトポ、ジャー |
| frying | 炒める・焼く | ジュワー、パチパチ |
| plating | 盛り付け | キラキラ、チーン |
| closeup_food | 完成品の寄り | ドドン、ジャーン |
| text_emphasis | テロップ強調 | ドン、バーン |
| reaction_surprise | 驚きリアクション | ズコー、ガーン |
| reaction_fail | 失敗リアクション | ブッブー、ガクッ |
| reaction_happy | 嬉しいリアクション | パチパチ、ファンファーレ |
| ending | 締め・CTA | ジングル、チャンネル登録音 |

## Gemini Flash プロンプト設計

```
あなたは料理ショート動画の編集アシスタントです。
以下のフレーム画像は料理動画から2秒間隔で抽出したものです。
各フレームの時間帯を以下のイベントカテゴリに分類してください。

カテゴリ:
- intro: 冒頭の挨拶・導入シーン
- ingredients_show: 材料を並べて見せるシーン
- cutting: 包丁で食材を切っているシーン
- mixing: ボウルなどで混ぜているシーン
- pouring: 液体を注いでいるシーン
- frying: フライパンや鍋で加熱しているシーン
- plating: 皿に盛り付けているシーン
- closeup_food: 完成した料理のアップ
- text_emphasis: テロップや文字が強調されているシーン
- reaction_surprise: 驚いた表情やリアクション
- reaction_fail: 失敗や残念なリアクション
- reaction_happy: 嬉しい・満足なリアクション
- ending: 動画の締めくくり

連続する同じイベントはまとめて1つの区間にしてください。
confidence（0.0-1.0）も付けてください。

JSON配列で返してください:
[{"start": 秒, "end": 秒, "event": "カテゴリ名", "confidence": 数値}]
```

1リクエストあたりフレーム15-30枚（30-60秒のショート動画想定）。
コスト: 約0.5円/動画（256px低解像度フレーム）。

## SE選択ロジック

1. イベントに対応するフォルダ `assets/sfx/{event}/` 内のファイル一覧を取得
2. 直前2イベントで使用したファイルを除外（重複回避）
3. 残りの候補からランダム選択
4. フォルダが空 or 存在しない場合はそのイベントをスキップ
5. confidence < 0.7 のイベントもスキップ

## config.json

```json
{
  "frame_interval_sec": 2,
  "frame_width_px": 256,
  "gemini_model": "gemini-2.0-flash",
  "confidence_threshold": 0.7,
  "duplicate_lookback": 2,
  "volume_db": {
    "default": -6,
    "cutting": -4,
    "frying": -4,
    "text_emphasis": -3,
    "reaction_surprise": -3,
    "closeup_food": -2,
    "intro": -8,
    "ending": -8
  },
  "output_format": "wav",
  "output_sample_rate": 44100
}
```

## SE素材の調達方針

- CapCut定番SE: CapCutプロジェクトから音声書き出しで抽出
- 料理実音系（ジュワー、トントン）: 効果音ラボ、OtoLogic、Pixabay等のフリー素材
- リアクション系（ドドン、ズコー）: 効果音ラボの定番素材
- 各フォルダに最低2-3バリエーションを用意（重複回避のため）
- ライセンス: 商用利用OKの素材のみ使用

## 依存関係

- Python 3.10+
- ffmpeg（フレーム抽出・wav合成）
- google-generativeai（Gemini API）
- Pillow（フレームリサイズ）

## 環境変数

- `GEMINI_API_KEY`: Gemini APIキー（必須）

## 使い方

```bash
# 基本実行
python scripts/run_pipeline.py input_video.mp4

# 出力
# → out/input_video_sfx.wav
# → out/input_video_events.json

# シーン検出だけ実行（SE合成なし）
python scripts/classify_scenes.py input_video.mp4

# SE選択・合成だけ実行（既存events.jsonから）
python scripts/render_sfx_track.py out/input_video_events.json input_video.mp4
```

## 将来の拡張（V2以降）

- SE音量の自動調整（音声トラックの音量に応じて動的に下げる）
- テロップ自動挿入との統合
- CapCut不要のフル自動書き出し
- SEプリセット（ジャンル別: 和食・洋食・お菓子等）
- バッチ処理（複数動画の一括処理）
