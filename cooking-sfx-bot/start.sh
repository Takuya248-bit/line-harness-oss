#!/bin/bash
# cooking-sfx-bot 自動起動スクリプト
# cloudflaredクイックトンネル + LINE Webhook URL自動更新
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# .envファイルから環境変数を読み込み
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo "[$(date)] Loading .env from $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
fi

# 必須環境変数チェック
: "${LINE_CHANNEL_SECRET:?LINE_CHANNEL_SECRET is required}"
: "${LINE_CHANNEL_ACCESS_TOKEN:?LINE_CHANNEL_ACCESS_TOKEN is required}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is required}"

SFX_DIR="${SFX_DIR:-$SCRIPT_DIR/assets/sfx}"
SESSIONS_DIR="${SESSIONS_DIR:-/tmp/cooking-sfx-sessions}"
LEARNING_DIR="${LEARNING_DIR:-$SCRIPT_DIR/data/learning}"
PORT="${PORT:-8000}"

mkdir -p "$SESSIONS_DIR" "$LEARNING_DIR"

# --- 1. uvicornサーバー起動 ---
echo "[$(date)] Starting uvicorn on port $PORT..."
cd "$SCRIPT_DIR"
SFX_DIR="$SFX_DIR" \
SESSIONS_DIR="$SESSIONS_DIR" \
LEARNING_DIR="$LEARNING_DIR" \
python3 -m uvicorn app:app --host 0.0.0.0 --port "$PORT" \
  > "$LOG_DIR/uvicorn.log" 2>&1 &
UVICORN_PID=$!
echo "[$(date)] uvicorn started (PID: $UVICORN_PID)"

# サーバー起動待ち
for i in $(seq 1 10); do
  if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "[$(date)] Server is ready"
    break
  fi
  sleep 1
done

# --- 2. cloudflaredトンネル起動 ---
echo "[$(date)] Starting cloudflared tunnel..."
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
cloudflared tunnel --url "http://localhost:$PORT" \
  > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo "[$(date)] cloudflared started (PID: $TUNNEL_PID)"

# トンネルURL取得待ち
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[$(date)] ERROR: Failed to get tunnel URL"
  kill $UVICORN_PID $TUNNEL_PID 2>/dev/null
  exit 1
fi
echo "[$(date)] Tunnel URL: $TUNNEL_URL"

# --- 3. LINE Webhook URL自動更新 ---
WEBHOOK_URL="${TUNNEL_URL}/webhook"
echo "[$(date)] Updating LINE webhook to: $WEBHOOK_URL"

RESPONSE=$(curl -sf -X PUT \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"endpoint\": \"$WEBHOOK_URL\"}" \
  "https://api.line.me/v2/bot/channel/webhook/endpoint" 2>&1) || true

echo "[$(date)] LINE API response: $RESPONSE"

# PUBLIC_URLをuvicornに伝える（ダウンロードリンク用）
export PUBLIC_URL="$TUNNEL_URL"

# --- 4. 状態表示 ---
echo ""
echo "========================================"
echo "  cooking-sfx-bot is running!"
echo "  Server:  http://localhost:$PORT"
echo "  Tunnel:  $TUNNEL_URL"
echo "  Webhook: $WEBHOOK_URL"
echo "  Logs:    $LOG_DIR/"
echo "========================================"
echo ""

# --- 5. シグナルハンドリング ---
cleanup() {
  echo "[$(date)] Shutting down..."
  kill $UVICORN_PID $TUNNEL_PID 2>/dev/null
  wait $UVICORN_PID $TUNNEL_PID 2>/dev/null
  echo "[$(date)] Stopped."
}
trap cleanup SIGINT SIGTERM

# フォアグラウンドで待機
wait $UVICORN_PID
