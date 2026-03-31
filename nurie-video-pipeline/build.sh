#!/bin/bash
# ==============================================
# 塗り絵ランキング動画 ワンコマンドビルド
# 使い方: ./build.sh <csv> [タイトル] [出力ファイル名]
# 例: ./build.sh data/travel_best_pref.csv
# ==============================================

set -e
cd "$(dirname "$0")"

CSV="${1:?CSVファイルを指定してください}"
TITLE="${2:-旅ガチ勢による行ってよかった都道府県ランキング}"
OUTPUT="${3:-output/final.mp4}"
SEC_PER_PREF=9.0
FPS=24

echo "=== 塗り絵動画ビルド開始 ==="
echo "CSV: $CSV"
echo "タイトル: $TITLE"
echo ""

# BGM生成（未生成の場合のみ）
if [ ! -f assets/bgm.wav ]; then
    echo "[1/2] BGM生成中..."
    python3 generate_bgm.py
else
    echo "[1/2] BGM: キャッシュ済み"
fi

# 動画生成（BGM直接渡し）
echo "[2/2] 動画生成中..."
python3 generate_video.py \
    --csv "$CSV" \
    --title "$TITLE" \
    --output "$OUTPUT" \
    --reverse \
    --sec-per-pref $SEC_PER_PREF \
    --fps $FPS \
    --bgm assets/bgm.wav

echo ""
echo "=== 完成 ==="
echo "出力: $OUTPUT"
echo "再生: open $OUTPUT"
