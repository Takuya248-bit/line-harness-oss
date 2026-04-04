#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/.local/share/crowdsourcing-autopilot"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/scan.log"

# .envをexportしてPython実行
cd "$PROJECT_DIR"
# .envをexport（コメント行・空行・スペース含む値を安全に処理）
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
  export "$line"
done < "$PROJECT_DIR/.env"
source "$PROJECT_DIR/.venv/bin/activate"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] scan start" >> "$LOG"
python main.py scan >> "$LOG" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] scan done" >> "$LOG"

# ログを500行に切り詰め
tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
