#!/bin/bash
# ==============================================
# 塗り絵ランキング動画 ワンコマンドビルド
# 使い方: ./build.sh <csv> <タイトル> [出力ファイル名]
# 例: ./build.sh data/traffic_accident_real.csv "都道府県別 交通事故率ランキング"
# ==============================================

set -e
cd "$(dirname "$0")"

CSV="${1:?CSVファイルを指定してください}"
TITLE="${2:?タイトルを指定してください}"
OUTPUT="${3:-output/final.mp4}"
SEC_PER_PREF=7.0
INTRO_SEC=7.0
FPS=24

echo "=== 塗り絵動画ビルド開始 ==="
echo "CSV: $CSV"
echo "タイトル: $TITLE"
echo ""

# Step 1: BGM生成（未生成の場合のみ）
if [ ! -f assets/bgm.wav ]; then
    echo "[1/4] BGM生成中..."
    python3 generate_bgm.py
else
    echo "[1/4] BGM: キャッシュ済み"
fi

# Step 2: ナレーション生成
echo "[2/4] ナレーション生成中..."
python3 generate_narration.py \
    --csv "$CSV" \
    --output assets/narration.wav \
    --sec-per-pref $SEC_PER_PREF \
    --intro-sec $INTRO_SEC \
    --reverse

# Step 3: BGM + ナレーションをミックス
echo "[3/4] オーディオミックス中..."
# ナレーションの長さに合わせてBGMをトリム＆ミックス
NARR_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 assets/narration.wav)
ffmpeg -y \
    -i assets/bgm.wav \
    -i assets/narration.wav \
    -filter_complex "[0:a]atrim=0:${NARR_DURATION},volume=0.3[bgm];[1:a]volume=1.0[narr];[bgm][narr]amix=inputs=2:duration=longest[out]" \
    -map "[out]" \
    assets/mixed_audio.wav \
    2>/dev/null
echo "オーディオミックス完了"

# Step 4: 動画生成
echo "[4/4] 動画生成中..."
python3 generate_video.py \
    --csv "$CSV" \
    --title "$TITLE" \
    --output "$OUTPUT" \
    --reverse \
    --sec-per-pref $SEC_PER_PREF \
    --fps $FPS \
    --bgm assets/mixed_audio.wav

echo ""
echo "=== 完成 ==="
echo "出力: $OUTPUT"
echo "再生: open $OUTPUT"
