#!/usr/bin/env bash
set -euo pipefail

# IG投稿画像プレビュー
# 使い方: ig-preview.sh <base_url> [count] [out_dir]
# 例: ig-preview.sh "https://ig-auto-poster.archbridge24.workers.dev/images/v4/2026-W14/0" 10

BASE_URL="${1:-}"
COUNT="${2:-10}"
OUT_DIR="${3:-/tmp/ig-preview/$(date +%s)}"

if [ -z "$BASE_URL" ]; then
  echo "使い方: $0 <base_url> [count] [out_dir]"
  echo "例: $0 \"https://ig-auto-poster.archbridge24.workers.dev/images/v4/2026-W14/0\" 10"
  exit 1
fi

mkdir -p "$OUT_DIR"

downloaded=0
failed=0

for i in $(seq 1 "$COUNT"); do
  url="${BASE_URL}/slide-${i}.png"
  out="${OUT_DIR}/slide-${i}.png"
  if curl -fsSL "$url" -o "$out" 2>/dev/null; then
    downloaded=$((downloaded + 1))
  else
    failed=$((failed + 1))
    rm -f "$out"
  fi
done

# HTMLギャラリー生成
cat > "${OUT_DIR}/index.html" <<'HTMLHEAD'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>IG Preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#111;color:#fff;padding:20px}
h1{font-size:18px;margin-bottom:16px;color:#aaa}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:#1a1a1a;border-radius:12px;overflow:hidden}
.card img{width:100%;display:block}
.caption{padding:8px 12px;font-size:13px;color:#888}
.meta{margin-bottom:16px;font-size:14px;color:#666}
</style>
</head>
<body>
<h1>IG Post Preview</h1>
HTMLHEAD

echo "<div class=\"meta\">成功: ${downloaded} / 失敗: ${failed}</div>" >> "${OUT_DIR}/index.html"
echo '<div class="grid">' >> "${OUT_DIR}/index.html"

for f in "${OUT_DIR}"/slide-*.png; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  w=$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" 2>/dev/null | awk '/pixelHeight/{print $2}')
  cat >> "${OUT_DIR}/index.html" <<CARD
<div class="card">
<img src="${name}" alt="${name}">
<div class="caption">${name} (${w}x${h})</div>
</div>
CARD
done

cat >> "${OUT_DIR}/index.html" <<'HTMLFOOT'
</div>
</body>
</html>
HTMLFOOT

echo "保存先: ${OUT_DIR}"
echo "成功: ${downloaded} / 失敗: ${failed}"

# 検証
for f in "${OUT_DIR}"/slide-*.png; do
  [ -e "$f" ] || continue
  echo "  $(basename "$f"): $(file -b "$f" | cut -c1-50)"
done

open "${OUT_DIR}/index.html"
