#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEETINGS_DIR="$SCRIPT_DIR/meetings"
PID_FILE="$SCRIPT_DIR/.recording.pid"
META_FILE="$SCRIPT_DIR/.recording.meta"

# Whisper モデル (large-v3 推奨、初回DLに3GB)
WHISPER_MODEL="${WHISPER_MODEL:-large-v3}"
# BlackHole デバイス名
BLACKHOLE_DEV="${BLACKHOLE_DEV:-BlackHole 2ch}"
# マイクデバイス名 (default = システムデフォルト)
MIC_DEV="${MIC_DEV:-default}"

usage() {
  cat <<'USAGE'
Usage: meeting.sh <command> [options]

Commands:
  start <name>   録音開始 (名前必須)
  stop           録音停止 → 文字起こし → 要約 → Notion投入
  list           過去のミーティング一覧
  transcribe <wav>  既存ファイルを文字起こし+要約

Environment:
  WHISPER_MODEL   Whisperモデル (default: large-v3)
  BLACKHOLE_DEV   BlackHoleデバイス名 (default: BlackHole 2ch)
  MIC_DEV         マイクデバイス名 (default: default)
USAGE
}

cmd_start() {
  local name="${1:?会議名を指定してください: meeting.sh start \"KOH定例\"}"

  if [ -f "$PID_FILE" ]; then
    echo "エラー: 録音が既に実行中です (PID: $(cat "$PID_FILE"))"
    echo "停止するには: ./meeting.sh stop"
    exit 1
  fi

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local safe_name
  safe_name="$(echo "$name" | tr ' /' '_')"
  local session_dir="$MEETINGS_DIR/${timestamp}_${safe_name}"
  mkdir -p "$session_dir"

  echo "録音開始: $name"
  echo "保存先: $session_dir"

  # マイク録音 (自分の声)
  sox -d -c 1 -r 16000 "$session_dir/mic.wav" &
  local mic_pid=$!

  # BlackHole録音 (相手の声 = システム音声)
  sox -t coreaudio "$BLACKHOLE_DEV" -c 1 -r 16000 "$session_dir/system.wav" &
  local sys_pid=$!

  # PIDとメタ情報を保存
  echo "$mic_pid $sys_pid" > "$PID_FILE"
  cat > "$META_FILE" <<EOF
name=$name
timestamp=$timestamp
session_dir=$session_dir
start_time=$(date +%H:%M)
EOF

  echo ""
  echo "録音中... 停止するには: ./meeting.sh stop"
  echo "  マイク PID: $mic_pid"
  echo "  システム音声 PID: $sys_pid"
}

cmd_stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "エラー: 録音が実行されていません"
    exit 1
  fi

  # メタ情報読み込み
  # shellcheck source=/dev/null
  source "$META_FILE"

  # 録音停止
  local pids
  pids="$(cat "$PID_FILE")"
  echo "録音停止中..."
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
  # sox がファイルを閉じるのを待つ
  sleep 1

  rm -f "$PID_FILE" "$META_FILE"

  local end_time
  end_time="$(date +%H:%M)"
  echo "録音停止: $name ($start_time - $end_time)"

  # 音声マージ (マイク + システム音声)
  local merged="$session_dir/merged.wav"
  if [ -f "$session_dir/mic.wav" ] && [ -f "$session_dir/system.wav" ]; then
    echo "音声マージ中..."
    sox -M "$session_dir/mic.wav" "$session_dir/system.wav" "$merged" remix 1,2
  elif [ -f "$session_dir/mic.wav" ]; then
    cp "$session_dir/mic.wav" "$merged"
  elif [ -f "$session_dir/system.wav" ]; then
    cp "$session_dir/system.wav" "$merged"
  else
    echo "エラー: 録音ファイルが見つかりません"
    exit 1
  fi

  # 文字起こし + 要約
  _transcribe_and_summarize "$merged" "$session_dir" "$name"
}

cmd_transcribe() {
  local wav_file="${1:?WAVファイルを指定してください}"
  local name="${2:-$(basename "$wav_file" .wav)}"

  if [ ! -f "$wav_file" ]; then
    echo "エラー: ファイルが見つかりません: $wav_file"
    exit 1
  fi

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local safe_name
  safe_name="$(echo "$name" | tr ' /' '_')"
  local session_dir="$MEETINGS_DIR/${timestamp}_${safe_name}"
  mkdir -p "$session_dir"
  cp "$wav_file" "$session_dir/merged.wav"

  _transcribe_and_summarize "$session_dir/merged.wav" "$session_dir" "$name"
}

_transcribe_and_summarize() {
  local wav_file="$1"
  local session_dir="$2"
  local name="$3"

  # Whisper 文字起こし
  echo ""
  echo "=== Whisper 文字起こし (model: $WHISPER_MODEL) ==="
  echo "処理中... (large-v3で1時間の音声 → 数分程度)"

  whisper "$wav_file" \
    --model "$WHISPER_MODEL" \
    --language ja \
    --output_format json \
    --output_dir "$session_dir" \
    2>&1 | tail -5

  local json_file="$session_dir/merged.json"
  if [ ! -f "$json_file" ]; then
    echo "エラー: 文字起こしファイルが生成されませんでした"
    exit 1
  fi

  # テキスト抽出
  local transcript_file="$session_dir/transcript.txt"
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$json_file', 'utf8'));
    const text = data.segments
      ? data.segments.map(s => s.text.trim()).join('\n')
      : data.text || '';
    fs.writeFileSync('$transcript_file', text);
  "

  echo "文字起こし完了: $transcript_file"
  echo ""

  # 要約 + Notion投入
  echo "=== 要約 + Notion投入 ==="
  node "$SCRIPT_DIR/summarize.mjs" "$transcript_file" "$name"

  echo ""
  echo "=== 完了 ==="
  echo "  文字起こし: $transcript_file"
  echo "  セッション: $session_dir"
}

cmd_list() {
  echo "=== ミーティング一覧 ==="
  if [ ! -d "$MEETINGS_DIR" ] || [ -z "$(ls -A "$MEETINGS_DIR" 2>/dev/null)" ]; then
    echo "  (まだミーティングがありません)"
    return
  fi

  for dir in "$MEETINGS_DIR"/*/; do
    local dirname
    dirname="$(basename "$dir")"
    local has_transcript=""
    [ -f "$dir/transcript.txt" ] && has_transcript=" [文字起こし済]"
    echo "  $dirname$has_transcript"
  done
}

# メインルーティング
case "${1:-}" in
  start)      shift; cmd_start "$@" ;;
  stop)       cmd_stop ;;
  list)       cmd_list ;;
  transcribe) shift; cmd_transcribe "$@" ;;
  *)          usage ;;
esac
