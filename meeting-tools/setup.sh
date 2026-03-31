#!/usr/bin/env bash
set -euo pipefail

# Meeting Tools セットアップ
# BlackHole + 複数出力装置の設定

echo "=== Meeting Tools セットアップ ==="
echo ""

# 1. 依存チェック
echo "[1/3] 依存ツールの確認..."
missing=()
command -v sox   >/dev/null 2>&1 || missing+=("sox")
command -v whisper >/dev/null 2>&1 || missing+=("openai-whisper (pip install openai-whisper)")

if [ ${#missing[@]} -gt 0 ]; then
  echo "  ✗ 未インストール: ${missing[*]}"
  echo "  → brew install sox && pip install openai-whisper"
  exit 1
fi
echo "  ✓ sox, whisper OK"

# 2. BlackHole インストール
echo ""
echo "[2/3] BlackHole (仮想オーディオデバイス) の確認..."
if ls /Library/Audio/Plug-Ins/HAL/ 2>/dev/null | grep -qi black; then
  echo "  ✓ BlackHole インストール済み"
else
  echo "  ✗ BlackHole が見つかりません"
  echo ""
  echo "  インストール方法:"
  echo "    brew install blackhole-2ch"
  echo ""
  echo "  インストール後、再度このスクリプトを実行してください。"
  exit 1
fi

# 3. 複数出力装置の設定案内
echo ""
echo "[3/3] macOS 複数出力装置の設定"
echo ""
echo "  Audio MIDI Setup (音声MIDI設定) で以下を設定してください:"
echo ""
echo "  1. Spotlight で「Audio MIDI Setup」を開く"
echo "  2. 左下の「+」→「複数出力装置を作成」"
echo "  3. 以下にチェック:"
echo "     ☑ イヤフォン (またはスピーカー)  ← マスターデバイスに設定"
echo "     ☑ BlackHole 2ch"
echo "  4. この装置に名前をつける: 「Meeting Output」推奨"
echo "  5. システム環境設定 → サウンド → 出力 で「Meeting Output」を選択"
echo ""
echo "  ミーティング開始時に出力を「Meeting Output」に切り替えてから"
echo "  ./meeting.sh start \"会議名\" を実行してください。"
echo ""
echo "=== セットアップ完了 ==="
