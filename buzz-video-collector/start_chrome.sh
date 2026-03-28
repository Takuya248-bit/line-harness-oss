#!/bin/bash
# デバッグポート付きでChromeを起動
# IGにログイン済みの状態で使う
echo "Chrome起動中（デバッグポート9222）..."
echo "IGにログイン済みの状態で buzz-video-collector を実行してください"
echo ""
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome" \
  --profile-directory="Default" &
echo "Chrome started. PID: $!"
