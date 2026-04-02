#!/bin/bash
# デバッグポート付きでChromeを起動する
# 既存のChromeプロセスを全て閉じてから実行すること
echo "Starting Chrome with debug port 9222..."
echo "Instagram にログインした状態でこのChromeを使ってください"
echo ""
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome" \
  --profile-directory="Default" &
echo "Chrome started. PID: $!"
echo "Ready to capture. Run: python3 capture_references.py --file reference_urls.txt"
