#!/bin/bash
# リッチメニュー6種 SVG→PNG生成スクリプト
# 1200x810px
set -euo pipefail

OUTDIR="$(cd "$(dirname "$0")" && pwd)"
FONT="Hiragino Sans, Noto Sans JP, sans-serif"
FW="700"

# 共通パーツ: トロピカル装飾
deco() {
  local accent="$1"
  cat << DECO
  <!-- トロピカル装飾: ヤシの木 -->
  <g opacity="0.08" fill="white">
    <path d="M50,810 Q60,650 80,600 Q40,580 20,500 Q60,520 90,580 Q85,540 100,480 Q100,550 95,590 Q120,560 160,540 Q120,580 90,600 Q100,700 90,810Z"/>
    <path d="M1150,810 Q1140,650 1120,600 Q1160,580 1180,500 Q1140,520 1110,580 Q1115,540 1100,480 Q1100,550 1105,590 Q1080,560 1040,540 Q1080,580 1110,600 Q1100,700 1110,810Z"/>
  </g>
  <!-- 波 -->
  <path d="M0,790 Q150,770 300,790 Q450,810 600,790 Q750,770 900,790 Q1050,810 1200,790 L1200,810 L0,810Z" fill="white" opacity="0.06"/>
  <path d="M0,800 Q150,780 300,800 Q450,820 600,800 Q750,780 900,800 Q1050,820 1200,800 L1200,810 L0,810Z" fill="white" opacity="0.04"/>
  <!-- 花柄アクセント -->
  <circle cx="100" cy="50" r="8" fill="${accent}" opacity="0.3"/>
  <circle cx="130" cy="35" r="5" fill="${accent}" opacity="0.2"/>
  <circle cx="1100" cy="50" r="8" fill="${accent}" opacity="0.3"/>
  <circle cx="1070" cy="35" r="5" fill="${accent}" opacity="0.2"/>
  <circle cx="80" cy="760" r="6" fill="${accent}" opacity="0.2"/>
  <circle cx="1120" cy="760" r="6" fill="${accent}" opacity="0.2"/>
DECO
}

svg_header() {
  local gs="$1" ge="$2"
  cat << HDR
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="810" viewBox="0 0 1200 810">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${gs}"/>
      <stop offset="100%" style="stop-color:${ge}"/>
    </linearGradient>
    <filter id="shadow" x="-2%" y="-2%" width="104%" height="104%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.15)"/>
    </filter>
  </defs>
  <rect width="1200" height="810" fill="url(#bg)"/>
HDR
}

# ボタン描画 (2x3グリッド)
btn_2x3() {
  local b1="$1" b2="$2" b3="$3" b4="$4" b5="$5" b6="$6"
  # Row1: 2列 (上段大きめ)
  cat << BTN
  <!-- Row 1: 左 -->
  <rect x="20" y="20" width="573" height="375" rx="18" fill="white" opacity="0.18" filter="url(#shadow)"/>
  <rect x="22" y="22" width="569" height="371" rx="16" fill="none" stroke="white" stroke-width="2" opacity="0.3"/>
  <text x="306" y="215" font-family="${FONT}" font-weight="${FW}" font-size="32" fill="white" text-anchor="middle">${b1}</text>
  <!-- Row 1: 右 -->
  <rect x="607" y="20" width="573" height="375" rx="18" fill="white" opacity="0.18" filter="url(#shadow)"/>
  <rect x="609" y="22" width="569" height="371" rx="16" fill="none" stroke="white" stroke-width="2" opacity="0.3"/>
  <text x="893" y="215" font-family="${FONT}" font-weight="${FW}" font-size="32" fill="white" text-anchor="middle">${b2}</text>
  <!-- Row 2: 左 -->
  <rect x="20" y="415" width="373" height="375" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="22" y="417" width="369" height="371" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="206" y="612" font-family="${FONT}" font-weight="${FW}" font-size="26" fill="white" text-anchor="middle">${b3}</text>
  <!-- Row 2: 中 -->
  <rect x="413" y="415" width="374" height="375" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="415" y="417" width="370" height="371" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="600" y="612" font-family="${FONT}" font-weight="${FW}" font-size="26" fill="white" text-anchor="middle">${b4}</text>
  <!-- Row 2: 右 -->
  <rect x="807" y="415" width="373" height="375" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="809" y="417" width="369" height="371" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="993" y="612" font-family="${FONT}" font-weight="${FW}" font-size="26" fill="white" text-anchor="middle">${b5}</text>
BTN
  # 6thボタンは右下に重なる→Row2の右を5thにして、別途6thを出力
  # 実は2x3は上2下3ではなく、3列2行が正しい。修正:
  # → 仕様を再確認: 上段2列+下段3列 なら上記でOK。6thボタンがない。
  # 仕様は「2x3」= 2行3列 = 6ボタン均等配置
  echo "" # placeholder
}

echo "=== リッチメニュー6種 SVG生成開始 ==="

# --- メニュー01: 診断促進（シアン系）大1+小3 ---
{
  svg_header "#00BCD4" "#0097A7"
  deco "#E0F7FA"
  cat << 'M01'
  <!-- 上段: 大ボタン全幅 -->
  <rect x="20" y="20" width="1160" height="460" rx="20" fill="white" opacity="0.18" filter="url(#shadow)"/>
  <rect x="22" y="22" width="1156" height="456" rx="18" fill="none" stroke="white" stroke-width="2" opacity="0.3"/>
  <circle cx="600" cy="170" r="50" fill="white" opacity="0.2"/>
  <text x="600" y="188" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="42" fill="white" text-anchor="middle">&#x2714;</text>
  <text x="600" y="300" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="48" fill="white" text-anchor="middle">30秒診断スタート</text>
  <text x="600" y="360" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="400" font-size="22" fill="white" text-anchor="middle" opacity="0.8">あなたにぴったりのプランがわかる！</text>
  <!-- 下段3分割 -->
  <rect x="20" y="500" width="373" height="290" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="22" y="502" width="369" height="286" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="206" y="655" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="28" fill="white" text-anchor="middle">よくある質問</text>
  <rect x="413" y="500" width="374" height="290" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="415" y="502" width="370" height="286" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="600" y="655" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="28" fill="white" text-anchor="middle">バリリンガルとは</text>
  <rect x="807" y="500" width="373" height="290" rx="16" fill="white" opacity="0.15" filter="url(#shadow)"/>
  <rect x="809" y="502" width="369" height="286" rx="14" fill="none" stroke="white" stroke-width="1.5" opacity="0.25"/>
  <text x="993" y="655" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-weight="700" font-size="28" fill="white" text-anchor="middle">チャットで相談</text>
M01
  echo "</svg>"
} > "${OUTDIR}/menu_01_diagnostic.svg"

# --- 2x3メニュー生成関数 (2行3列 = 6ボタン均等) ---
gen_2x3() {
  local file="$1" gs="$2" ge="$3" accent="$4"
  local b1="$5" b2="$6" b3="$7" b4="$8" b5="$9" b6="${10}"

  # グリッド: 3列2行, gap=10, margin=15
  # col幅=(1200-15*2-10*2)/3 = 383.3 → 383
  # row高=(810-15*2-10)/2 = 385
  local CW=383 RH=385 MX=15 MY=15 GAP=10

  {
    svg_header "$gs" "$ge"
    deco "$accent"

    local row col x y bx by label fs
    local labels=("$b1" "$b2" "$b3" "$b4" "$b5" "$b6")
    for i in 0 1 2 3 4 5; do
      row=$((i / 3))
      col=$((i % 3))
      x=$((MX + col * (CW + GAP)))
      y=$((MY + row * (RH + GAP)))
      bx=$((x + CW / 2))
      by=$((y + RH / 2 + 10))
      label="${labels[$i]}"

      # フォントサイズ: 文字数に応じて調整
      if [ ${#label} -le 6 ]; then
        fs=32
      elif [ ${#label} -le 8 ]; then
        fs=30
      else
        fs=26
      fi

      cat << CELL
  <rect x="${x}" y="${y}" width="${CW}" height="${RH}" rx="18" fill="white" opacity="0.17" filter="url(#shadow)"/>
  <rect x="$((x+2))" y="$((y+2))" width="$((CW-4))" height="$((RH-4))" rx="16" fill="none" stroke="white" stroke-width="1.5" opacity="0.28"/>
  <text x="${bx}" y="${by}" font-family="${FONT}" font-weight="${FW}" font-size="${fs}" fill="white" text-anchor="middle">${label}</text>
CELL
    done

    echo "</svg>"
  } > "${OUTDIR}/${file}.svg"
}

# メニュー02: メイン訴求（ティール系）
gen_2x3 "menu_02_main" "#009688" "#00796B" "#E0F2F1" \
  "見積もり依頼" "面談を予約する" "チャットで相談" \
  "プランを見る" "卒業生の声" "よくある質問"

# メニュー03: 見積比較訴求（ブルー系）
gen_2x3 "menu_03_estimate" "#2196F3" "#1565C0" "#E3F2FD" \
  "見積について相談する" "面談を予約する" "チャットで相談" \
  "プランを見る" "卒業生の声" "よくある質問"

# メニュー04: 申込後押し（パープル系）
gen_2x3 "menu_04_apply" "#9C27B0" "#7B1FA2" "#F3E5F5" \
  "申込みについて相談する" "見積もりを確認" "チャットで相談" \
  "渡航準備ガイド" "プランを見る" "よくある質問"

# メニュー05: 再興味喚起（オレンジ系）
gen_2x3 "menu_05_reactivate" "#FF9800" "#EF6C00" "#FFF3E0" \
  "プランを見る" "診断をやり直す" "チャットで相談" \
  "卒業生の声" "よくある質問" "バリリンガルとは"

# メニュー06: 渡航準備（グリーン系）
gen_2x3 "menu_06_travel" "#4CAF50" "#2E7D32" "#E8F5E9" \
  "渡航準備を確認する" "必要書類を見る" "チャットで相談" \
  "持ち物リスト" "現地情報" "よくある質問"

echo "=== SVG生成完了。PNG変換開始 ==="

for svg in "${OUTDIR}"/menu_*.svg; do
  png="${svg%.svg}.png"
  rsvg-convert -w 1200 -h 810 "$svg" -o "$png"
  echo "  生成: $(basename "$png")"
done

echo "=== 全6種のPNG生成完了 ==="
ls -la "${OUTDIR}"/menu_*.png
