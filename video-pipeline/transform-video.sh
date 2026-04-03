#!/bin/bash
# 動画変換パイプライン: 顔差し替え + 髪型・服装変更
# 使い方: ./transform-video.sh <元動画> <参照画像> [出力ファイル]
#
# 例: ./transform-video.sh /tmp/rina.mp4 /tmp/reference.jpg /tmp/output.mp4

set -euo pipefail

# --- 設定 ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/config.json"
SSH_USER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).ssh_user)")
SSH_HOST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).ssh_host)")
REMOTE="$SSH_USER@$SSH_HOST"
REMOTE_DIR="C:/video-pipeline"

# --- 引数 ---
SOURCE_VIDEO="${1:?使い方: $0 <元動画> <参照画像> [出力ファイル]}"
REFERENCE_IMAGE="${2:?参照画像を指定してください}"
OUTPUT="${3:-${SOURCE_VIDEO%.*}_transformed.mp4}"

echo "=== 動画変換パイプライン ==="
echo "元動画: $SOURCE_VIDEO"
echo "参照画像: $REFERENCE_IMAGE"
echo "出力先: $OUTPUT"
echo ""

# --- Step 1: ファイル転送 ---
echo "[1/4] ファイルをWindowsに転送中..."
REMOTE_VIDEO="$REMOTE_DIR/$(basename "$SOURCE_VIDEO")"
REMOTE_REF="$REMOTE_DIR/$(basename "$REFERENCE_IMAGE")"
REMOTE_OUTPUT="$REMOTE_DIR/output_$(basename "$SOURCE_VIDEO")"

scp "$SOURCE_VIDEO" "$REFERENCE_IMAGE" "$REMOTE:$REMOTE_DIR/"
echo "  転送完了"

# --- Step 2: FaceFusion (顔差し替え + 補正) ---
echo "[2/4] FaceFusion実行中 (Windows CUDA)..."
START_TIME=$(date +%s)

ssh "$REMOTE" "cd C:\\facefusion; .\\venv\\Scripts\\python.exe facefusion.py headless-run \
  -s '$REMOTE_REF' \
  -t '$REMOTE_VIDEO' \
  -o '$REMOTE_OUTPUT' \
  --processors face_swapper face_enhancer \
  --face-swapper-model inswapper_128_fp16 \
  --face-enhancer-model gfpgan_1.4 \
  --face-enhancer-blend 80 \
  --face-detector-model yolo_face \
  --execution-providers cuda" 2>&1 | grep -E "processing:|succeeded|error" | tail -5

END_TIME=$(date +%s)
echo "  FaceFusion完了 ($((END_TIME - START_TIME))秒)"

# --- Step 3: 結果ダウンロード ---
echo "[3/4] 結果をダウンロード中..."
scp "$REMOTE:$REMOTE_OUTPUT" "$OUTPUT"
echo "  ダウンロード完了: $OUTPUT"

# --- Step 4: クリーンアップ ---
echo "[4/4] Windows側の一時ファイル削除..."
ssh "$REMOTE" "Remove-Item '$REMOTE_VIDEO', '$REMOTE_REF', '$REMOTE_OUTPUT' -ErrorAction SilentlyContinue"

echo ""
echo "=== 完了 ==="
echo "出力: $OUTPUT"
echo "再生: open \"$OUTPUT\""
