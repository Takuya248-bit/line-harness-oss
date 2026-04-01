#!/usr/bin/env bash
set -euo pipefail

echo "=== Meeting Tools セットアップ ==="
echo ""

# 1. 依存チェック
echo "[1/4] 依存ツールの確認..."
missing=()
command -v sox    >/dev/null 2>&1 || missing+=("sox")
command -v ffmpeg >/dev/null 2>&1 || missing+=("ffmpeg")
command -v curl   >/dev/null 2>&1 || missing+=("curl")
command -v node   >/dev/null 2>&1 || missing+=("node")

if [ ${#missing[@]} -gt 0 ]; then
  echo "  未インストール: ${missing[*]}"
  echo "  → brew install ${missing[*]}"
  exit 1
fi
echo "  sox, ffmpeg, curl, node OK"

# 2. API キー確認
echo ""
echo "[2/4] APIキーの確認..."
[ -n "${GROQ_API_KEY:-}" ]     && echo "  GROQ_API_KEY OK"     || echo "  GROQ_API_KEY 未設定 (文字起こしに必要)"
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "  ANTHROPIC_API_KEY OK" || echo "  ANTHROPIC_API_KEY 未設定 (要約に必要)"

# 3. BlackHole インストール
echo ""
echo "[3/4] BlackHole (仮想オーディオデバイス) の確認..."
if ls /Library/Audio/Plug-Ins/HAL/ 2>/dev/null | grep -qi black; then
  echo "  BlackHole インストール済み"
else
  echo "  BlackHole が見つかりません"
  echo ""
  echo "  インストール: brew install blackhole-2ch"
  exit 1
fi

# 4. 複数出力装置の設定案内
echo ""
echo "[4/4] macOS 複数出力装置の設定"
echo ""
echo "  Audio MIDI Setup で以下を設定:"
echo ""
echo "  1. Spotlight で「Audio MIDI Setup」を開く"
echo "  2. 左下の「+」→「複数出力装置を作成」"
echo "  3. 以下にチェック:"
echo "     イヤフォン (またはスピーカー)  ← マスターデバイスに設定"
echo "     BlackHole 2ch"
echo "  4. 装置名: 「Meeting Output」推奨"
echo "  5. システム設定 → サウンド → 出力 で「Meeting Output」を選択"
echo ""
echo "  ミーティング時に出力を「Meeting Output」に切り替えてから"
echo "  ./meeting.sh start \"会議名\" を実行"
echo ""
echo "=== セットアップ完了 ==="
