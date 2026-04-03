# IG リール品質A級アップグレード設計 (v2)

## 方針

Remotion導入より先に、コンテンツ品質と導線を改善する。技術はffmpeg+ASS字幕で即効性を取る。

## 優先順位

1. コンテンツカテゴリ刷新（バリリンガル宣伝→バリ島情報+英語学習）
2. ffmpeg+ASS字幕でテロップ品質UP
3. クロスフェード・フォーマット別尺設定
4. DM誘導CTA（「バリとコメントでガイド送る」）
5. 将来: 実写クリップストック、Remotion移行、声クローン

## Phase 1: 即実装（今回スコープ）

### 1-1. コンテンツカテゴリ刷新

バリリンガルの直接宣伝はしない。バリ島情報+英語学習で価値提供。

| カテゴリ | 週配分 | 例 |
|---|---|---|
| bali_tips | 2本 | カフェTOP5/隠れスポット/節約術 |
| english_phrase | 2本 | ネイティブフレーズ/間違えやすい表現 |
| bali_english | 1本 | バリで使える英語/インドネシア英語あるある |
| bali_life | 1本 | バリ在住者の1日/食費/カフェ文化 |
| relatable | 1本 | 海外生活あるある/文化比較 |

プロンプト指示:
- バリリンガル、語学学校、留学費用の宣伝は一切しない
- 一次情報（具体的な店名、金額、体験）を優先
- LLMが知らない情報はknowledge_entriesから注入

### 1-2. ASS字幕テロップシステム

ffmpeg drawtextを廃止し、ASS字幕に置換。

```
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Hook,Zen Maru Gothic,56,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,3,2,2,60,60,80,1
Style: Fact,Zen Maru Gothic,42,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,2,2,2,60,60,120,1
Style: Number,Zen Maru Gothic,72,&H0000BCD4,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,7,30,0,30,1
```

特徴:
- 半透明ボックス背景(BackColour &H96000000)
- 太字+アウトライン+影
- フェードイン(\fad(300,0))
- ナンバリング(左上、アクセントカラー)

### 1-3. クロスフェード・尺設定

クリップ間: 0.3秒クロスフェード(`xfade=transition=fade:duration=0.3`)

フォーマット別尺:
| フォーマット | 総尺 | フック | ファクト数×秒 | CTA |
|---|---|---|---|---|
| ranking(bali_tips) | 25秒 | 3秒 | 5×3.4秒 | 5秒 |
| english_phrase | 15秒 | 2秒 | 3×3秒 | 4秒 |
| bali_english | 20秒 | 3秒 | 4×3秒 | 5秒 |
| routine(bali_life) | 30秒 | 3秒 | 6×3.5秒 | 6秒 |
| relatable | 20秒 | 2秒 | 5×2.8秒 | 4秒 |

### 1-4. DM誘導CTA

ランキング型のCTAを変更:
- 旧: 「保存して」「プロフのLINEから」
- 新: 「"バリ"とコメントで○○ガイド送ります」

カテゴリ別CTA:
- bali_tips: 「"カフェ"とコメントでバリ島カフェMAP送ります」
- english_phrase: 「"英語"とコメントでフレーズ集送ります」
- bali_english: 「"バリ英語"とコメントで使えるフレーズ集送ります」
- bali_life: 「保存して次のバリ旅行の参考に」
- relatable: 「共感したら友達にシェア」

## 変更対象ファイル

### content-planner.ts
- reelFormatBlock()のカテゴリ名をbali_tips/english_phrase等に変更
- プロンプトに「バリリンガルの宣伝をしない」を明記
- CTA生成にカテゴリ別テンプレートを使用

### reel-planner.ts
- ALL_FORMATSをbali_tips/english_phrase/bali_english/bali_life/relatableに変更
- フォーマット別尺設定を追加
- DEFAULT_COUNTSを新カテゴリに合わせて更新

### generate-reel.mjs
- drawtextチェーンをASS字幕ファイル生成+`ass`フィルターに置換
- クロスフェードトランジション追加
- フォーマット別尺に対応

### types.ts
- ReelFormat型を新カテゴリに変更

## Phase 2: 将来（今回スコープ外）

- 実写クリップR2ストック → Pexelsフォールバック
- Style-Bert-VITS2声クローン
- Remotion移行（Phase 1で品質不足の場合）
- ManyChat等でコメント→自動DM送信
- IG Graph APIコメント監視Worker
