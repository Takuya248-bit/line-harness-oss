#!/bin/bash
# cooking-sfx-bot: uvicorn + cloudflaredクイックトンネル
# トンネルが死んだらexit → launchdが再起動
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# .env読み込み
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi
: "${LINE_CHANNEL_SECRET:?required}"
: "${LINE_CHANNEL_ACCESS_TOKEN:?required}"
: "${ANTHROPIC_API_KEY:?required}"

export LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN ANTHROPIC_API_KEY
export SFX_DIR="${SFX_DIR:-$SCRIPT_DIR/assets/sfx}"
export SESSIONS_DIR="${SESSIONS_DIR:-/tmp/cooking-sfx-sessions}"
export LEARNING_DIR="${LEARNING_DIR:-$SCRIPT_DIR/data/learning}"
export PORT="${PORT:-8000}"
mkdir -p "$SESSIONS_DIR" "$LEARNING_DIR"

cleanup() {
  echo "[$(date)] Shutting down..."
  kill $UVICORN_PID $TUNNEL_PID 2>/dev/null || true
  wait $UVICORN_PID $TUNNEL_PID 2>/dev/null || true
  echo "[$(date)] Stopped."
}
trap cleanup EXIT

# --- uvicorn ---
cd "$SCRIPT_DIR"
python3 -m uvicorn app:app --host 0.0.0.0 --port "$PORT" \
  >> "$LOG_DIR/uvicorn.log" 2>&1 &
UVICORN_PID=$!

for i in $(seq 1 15); do
  curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1 && break
  sleep 1
done
echo "[$(date)] uvicorn ready (PID: $UVICORN_PID)"

# --- cloudflared ---
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
: > "$TUNNEL_LOG"
cloudflared tunnel --url "http://localhost:$PORT" \
  > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# URLがログに出るまで待つ
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -ao 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done
[ -z "$TUNNEL_URL" ] && { echo "[$(date)] ERROR: No tunnel URL"; exit 1; }

# URLが実際に疎通するまで待つ（DNSの伝搬待ち）
for i in $(seq 1 30); do
  curl -sf --max-time 5 "$TUNNEL_URL/health" > /dev/null 2>&1 && break
  sleep 2
done
echo "[$(date)] Tunnel ready: $TUNNEL_URL"

# --- webhook更新 ---
for attempt in 1 2 3; do
  RESP=$(curl -s -X PUT \
    -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"endpoint\": \"${TUNNEL_URL}/webhook\"}" \
    "https://api.line.me/v2/bot/channel/webhook/endpoint" 2>&1)
  # LINE APIは成功時に空ボディか{}を返す
  if [ -z "$RESP" ] || [ "$RESP" = "{}" ]; then
    echo "[$(date)] Webhook updated: ${TUNNEL_URL}/webhook"
    break
  fi
  echo "[$(date)] Webhook attempt $attempt failed: $RESP"
  sleep 3
done

echo "[$(date)] Running. Monitoring tunnel..."

# --- 監視ループ: cloudflaredプロセス死亡でexit → launchdが再起動 ---
while true; do
  sleep 30
  # cloudflaredプロセスの生存確認
  if ! kill -0 $TUNNEL_PID 2>/dev/null; then
    echo "[$(date)] cloudflared process died, exiting for restart..."
    exit 1
  fi
  # uvicornの生存確認
  if ! kill -0 $UVICORN_PID 2>/dev/null; then
    echo "[$(date)] uvicorn process died, exiting for restart..."
    exit 1
  fi
done
