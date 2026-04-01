#!/usr/bin/env bash
set -euo pipefail

# Hammerspoon等の非ログインシェルから起動された場合に環境変数を読み込む
if [ -z "${GROQ_API_KEY:-}" ] && [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEETINGS_DIR="$SCRIPT_DIR/meetings"
PID_FILE="$SCRIPT_DIR/.recording.pid"
META_FILE="$SCRIPT_DIR/.recording.meta"

# Groq API (whisper-large-v3、無料・高速・高精度)
GROQ_API_KEY="${GROQ_API_KEY:?GROQ_API_KEYを設定してください}"
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
  GROQ_API_KEY    Groq APIキー (必須)
  BLACKHOLE_DEV   BlackHoleデバイス名 (default: BlackHole 2ch)
  MIC_DEV         マイクデバイス名 (default: default)
USAGE
}

_ensure_meeting_output() {
  # Meeting Outputが存在しなければSwiftで自動作成
  if ! SwitchAudioSource -a -t output 2>/dev/null | grep -q "Meeting Output"; then
    echo "Meeting Output装置を作成中..."
    swift "$SCRIPT_DIR/create-meeting-output.swift" 2>/dev/null || true
  fi
}

cmd_start() {
  local name="${1:?会議名を指定してください: meeting.sh start \"KOH定例\"}"

  if [ -f "$PID_FILE" ]; then
    echo "エラー: 録音が既に実行中です (PID: $(cat "$PID_FILE"))"
    echo "停止するには: ./meeting.sh stop"
    exit 1
  fi

  # Meeting Output装置を確認・作成
  _ensure_meeting_output

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

  # Groq API 文字起こし (whisper-large-v3-turbo)
  echo ""
  echo "=== Groq API 文字起こし (whisper-large-v3-turbo) ==="

  # 25MBを超える場合はffmpegで分割
  local file_size
  file_size=$(stat -f%z "$wav_file" 2>/dev/null || stat -c%s "$wav_file" 2>/dev/null)
  local max_size=$((24 * 1024 * 1024))  # 24MB (余裕を持たせる)

  local transcript_file="$session_dir/transcript.txt"
  > "$transcript_file"

  if [ "$file_size" -gt "$max_size" ]; then
    echo "ファイルサイズ: $((file_size / 1024 / 1024))MB → 分割して処理"
    local chunk_dir="$session_dir/chunks"
    mkdir -p "$chunk_dir"

    # 10分ごとに分割
    ffmpeg -i "$wav_file" -f segment -segment_time 600 \
      -c copy "$chunk_dir/chunk_%03d.wav" -y 2>/dev/null

    for chunk in "$chunk_dir"/chunk_*.wav; do
      echo "  処理中: $(basename "$chunk")"
      local chunk_text
      chunk_text=$(curl -s "https://api.groq.com/openai/v1/audio/transcriptions" \
        -H "Authorization: Bearer $GROQ_API_KEY" \
        -F "file=@$chunk" \
        -F "model=whisper-large-v3-turbo" \
        -F "language=ja" \
        -F "response_format=text")
      echo "$chunk_text" >> "$transcript_file"
    done
    rm -rf "$chunk_dir"
  else
    echo "処理中..."
    curl -s "https://api.groq.com/openai/v1/audio/transcriptions" \
      -H "Authorization: Bearer $GROQ_API_KEY" \
      -F "file=@$wav_file" \
      -F "model=whisper-large-v3-turbo" \
      -F "language=ja" \
      -F "response_format=text" > "$transcript_file"
  fi

  if [ ! -s "$transcript_file" ]; then
    echo "エラー: 文字起こしが空です"
    exit 1
  fi

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
