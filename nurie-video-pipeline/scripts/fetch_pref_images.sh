#!/bin/bash
# 47都道府県画像をPexels APIから取得
set -e
cd "$(dirname "$0")/.."

PEXELS_KEY=$(cat ~/douga/.pexels_key)
OUT_DIR="assets/pref_images"
mkdir -p "$OUT_DIR"

declare -A QUERIES=(
  ["01_沖縄県"]="Okinawa beach ocean"
  ["02_北海道"]="Hokkaido sushi seafood"
  ["03_京都府"]="Kyoto temple autumn"
  ["04_東京都"]="Tokyo ramen night"
  ["05_大阪府"]="Osaka street food japan"
  ["06_石川県"]="Kanazawa fish market"
  ["07_福岡県"]="Fukuoka ramen yatai"
  ["08_兵庫県"]="Kobe harbor night"
  ["09_千葉県"]="farm ice cream cow"
  ["10_長野県"]="Nagano mountain snow"
  ["11_広島県"]="Hiroshima momiji maple"
  ["12_奈良県"]="Nara deer temple"
  ["13_長崎県"]="champon noodle japan"
  ["14_静岡県"]="hamburger steak japan"
  ["15_神奈川県"]="Enoshima sea train"
  ["16_山梨県"]="Mount Fuji lake"
  ["17_三重県"]="Ise shrine japan"
  ["18_大分県"]="Beppu onsen steam"
  ["19_愛知県"]="Nagoya morning toast"
  ["20_宮崎県"]="chicken nanban japan"
  ["21_香川県"]="udon noodle japan"
  ["22_熊本県"]="Aso volcano japan"
  ["23_岐阜県"]="Takayama beef sushi"
  ["24_新潟県"]="soba sake japan"
  ["25_鹿児島県"]="Sakurajima volcano"
  ["26_岡山県"]="peach fruit japan"
  ["27_群馬県"]="Kusatsu onsen japan"
  ["28_宮城県"]="beef tongue grill"
  ["29_鳥取県"]="sand dunes japan"
  ["30_青森県"]="tuna sashimi japan"
  ["31_和歌山県"]="Nachi waterfall japan"
  ["32_島根県"]="Izumo shrine japan"
  ["33_山口県"]="bridge sea blue"
  ["34_福島県"]="ramen noodle japan"
  ["35_富山県"]="sushi japan fresh"
  ["36_栃木県"]="gyoza dumplings japan"
  ["37_滋賀県"]="Lake Biwa japan"
  ["38_山形県"]="cherry fruit farm"
  ["39_秋田県"]="hot pot nabe japan"
  ["40_高知県"]="katsuo bonito japan"
  ["41_愛媛県"]="onsen bath japan"
  ["42_岩手県"]="soba noodle bowl"
  ["43_福井県"]="crab seafood japan"
  ["44_茨城県"]="blue flowers field"
  ["45_埼玉県"]="sweet potato dessert"
  ["46_佐賀県"]="squid sashimi japan"
  ["47_徳島県"]="dance festival japan"
)

SUCCESS=0
TOTAL=${#QUERIES[@]}

for key in $(echo "${!QUERIES[@]}" | tr ' ' '\n' | sort); do
  query="${QUERIES[$key]}"
  out_file="$OUT_DIR/${key}.jpg"

  if [ -f "$out_file" ]; then
    echo "SKIP: $key"
    SUCCESS=$((SUCCESS + 1))
    continue
  fi

  echo -n "[$key] $query ... "
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))")

  img_url=$(curl -s -H "Authorization: $PEXELS_KEY" \
    "https://api.pexels.com/v1/search?query=${encoded}&per_page=1&orientation=landscape" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['photos'][0]['src']['medium'] if d.get('photos') else '')" 2>/dev/null)

  if [ -n "$img_url" ]; then
    curl -s -o "$out_file" "$img_url"
    echo "OK"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "NO RESULT"
  fi
  sleep 0.3
done

echo ""
echo "Done: $SUCCESS/$TOTAL images"
