#!/bin/bash
# IGログイン用: デバッグポート付きChromeを起動
# 1. このスクリプトを実行
# 2. 開いたChromeでInstagramにログイン
# 3. ログイン完了したらCtrl+Cで終了
echo "Chrome起動中（デバッグポート9222）..."
echo "IGにログインしてください。完了したらCtrl+C"
echo ""
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/.pw-profile" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.instagram.com/accounts/login/" 2>/dev/null
