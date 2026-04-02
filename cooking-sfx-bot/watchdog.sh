#!/bin/bash
# cooking-sfx-bot watchdog
# トンネル死活監視 → 死亡時にcloudflared再起動+webhook再登録
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
PIDFILE="$LOG_DIR/cloudflared.pid"
PORT="${PORT:-8000}"

# .env読み込み
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

restart_tunnel() {
  echo "[$(date)] WATCHDOG: Restarting cloudflared..."

  # 既存プロセスをkill
  if [ -f "$PIDFILE" ]; then
    OLD_PID=$(cat "$PIDFILE")
    kill "$OLD_PID" 2>/dev/null
    sleep 2
  fi
  # 残存プロセスも掃除
  pkill -f "cloudflared tunnel --url http://localhost:$PORT" 2>/dev/null
  sleep 1

  # cloudflared再起動
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url "http://localhost:$PORT" \
    > "$TUNNEL_LOG" 2>&1 &
  NEW_PID=$!
  echo "$NEW_PID" > "$PIDFILE"
  echo "[$(date)] WATCHDOG: cloudflared started (PID: $NEW_PID)"

  # 新URL取得
  NEW_URL=""
  for i in $(seq 1 30); do
    NEW_URL=$(grep -ao 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
    if [ -n "$NEW_URL" ]; then break; fi
    sleep 1
  done

  if [ -z "$NEW_URL" ]; then
    echo "[$(date)] WATCHDOG: Failed to get tunnel URL"
    return 1
  fi

  echo "$NEW_URL" > "$LOG_DIR/public_url.txt"
  echo "[$(date)] WATCHDOG: New tunnel URL: $NEW_URL"

  # webhook再登録（リトライ付き）
  WEBHOOK_URL="${NEW_URL}/webhook"
  for attempt in 1 2 3; do
    RESP=$(curl -s -X PUT \
      -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"endpoint\": \"$WEBHOOK_URL\"}" \
      "https://api.line.me/v2/bot/channel/webhook/endpoint" 2>&1)
    echo "[$(date)] WATCHDOG: Webhook update attempt $attempt: $RESP"
    if [ -z "$RESP" ] || echo "$RESP" | grep -qE '^\s*\{?\s*\}?\s*$'; then
      echo "[$(date)] WATCHDOG: Webhook updated OK"
      return 0
    fi
    sleep 5
  done
  echo "[$(date)] WATCHDOG: Webhook update failed"
  return 1
}

echo "[$(date)] WATCHDOG: Started, checking every 60s"

while true; do
  sleep 60

  TUNNEL_URL=$(cat "$LOG_DIR/public_url.txt" 2>/dev/null)
  if [ -z "$TUNNEL_URL" ]; then
    echo "[$(date)] WATCHDOG: No tunnel URL found, restarting..."
    restart_tunnel
    continue
  fi

  # トンネル経由でヘルスチェック
  if ! curl -sf --max-time 10 "$TUNNEL_URL/health" > /dev/null 2>&1; then
    echo "[$(date)] WATCHDOG: Tunnel unreachable ($TUNNEL_URL)"
    restart_tunnel
  fi
done
