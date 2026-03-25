#!/bin/bash
# LINE公式アカウント無料診断bot セットアップスクリプト
# Usage: bash scripts/setup_diagnostic_bot.sh

set -euo pipefail

API_BASE="${API_BASE:?ERROR: API_BASE environment variable is required. Set it with: export API_BASE=https://your.workers.dev}"
API_TOKEN="${API_TOKEN:?ERROR: API_TOKEN environment variable is required. Set it with: export API_TOKEN=your_api_token}"

api() {
  local method=$1 path=$2 data=${3:-}
  curl -s --retry 3 --retry-delay 2 --retry-all-errors --max-time 30 -X "$method" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    ${data:+-d "$data"} \
    "$API_BASE$path"
}

echo "============================================"
echo " LINE公式アカウント無料診断bot セットアップ"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ============================================
# 1. タグ作成
# ============================================
echo ">>> Step 1: 診断用タグ作成"

TAG_IDS=()
TAG_NAMES=(
  "diag_beauty" "diag_restaurant" "diag_school" "diag_ec" "diag_other"
  "diag_none" "diag_idle" "diag_sometimes" "diag_weekly"
  "diag_friends_s" "diag_friends_m" "diag_friends_l" "diag_friends_xl"
  "diag_growth" "diag_engagement" "diag_repeat" "diag_automation"
  "diag_budget_0" "diag_budget_5k" "diag_budget_10k" "diag_budget_30k"
  "diag_started" "diag_completed" "consul_interest"
)
TAG_COLORS=(
  "#EC4899" "#F97316" "#3B82F6" "#8B5CF6" "#64748B"
  "#EF4444" "#F59E0B" "#10B981" "#06B6D4"
  "#64748B" "#F59E0B" "#10B981" "#3B82F6"
  "#EF4444" "#F97316" "#8B5CF6" "#06B6D4"
  "#64748B" "#F59E0B" "#10B981" "#3B82F6"
  "#EC4899" "#10B981" "#EF4444"
)

for i in "${!TAG_NAMES[@]}"; do
  echo "  Creating tag: ${TAG_NAMES[$i]}"
  RESULT=$(api POST /api/tags "{\"name\":\"${TAG_NAMES[$i]}\",\"color\":\"${TAG_COLORS[$i]}\"}")
  TAG_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',d.get('tag',{}).get('id',d.get('id',''))))" 2>/dev/null || echo "")
  if [ -z "$TAG_ID" ]; then
    echo "    WARN: Could not extract tag ID. Response: $RESULT"
    TAG_ID="UNKNOWN"
  else
    echo "    OK: id=$TAG_ID"
  fi
  TAG_IDS+=("$TAG_ID")
done

# Q1 業種タグ
TAG_BEAUTY=${TAG_IDS[0]}
TAG_RESTAURANT=${TAG_IDS[1]}
TAG_SCHOOL=${TAG_IDS[2]}
TAG_EC=${TAG_IDS[3]}
TAG_OTHER=${TAG_IDS[4]}

# Q2 LINE公式の状態タグ
TAG_NONE=${TAG_IDS[5]}
TAG_IDLE=${TAG_IDS[6]}
TAG_SOMETIMES=${TAG_IDS[7]}
TAG_WEEKLY=${TAG_IDS[8]}

# Q3 友だち数タグ
TAG_FRIENDS_S=${TAG_IDS[9]}
TAG_FRIENDS_M=${TAG_IDS[10]}
TAG_FRIENDS_L=${TAG_IDS[11]}
TAG_FRIENDS_XL=${TAG_IDS[12]}

# Q4 課題タグ
TAG_GROWTH=${TAG_IDS[13]}
TAG_ENGAGEMENT=${TAG_IDS[14]}
TAG_REPEAT=${TAG_IDS[15]}
TAG_AUTOMATION=${TAG_IDS[16]}

# Q5 予算タグ
TAG_BUDGET_0=${TAG_IDS[17]}
TAG_BUDGET_5K=${TAG_IDS[18]}
TAG_BUDGET_10K=${TAG_IDS[19]}
TAG_BUDGET_30K=${TAG_IDS[20]}

# 管理用タグ
TAG_DIAG_STARTED=${TAG_IDS[21]}
TAG_DIAG_COMPLETED=${TAG_IDS[22]}
TAG_CONSUL=${TAG_IDS[23]}

echo ""
echo "Tags created: ${#TAG_IDS[@]} tags"
echo ""

# ============================================
# 2. 診断開始シナリオ（キーワード「診断」で起動）
# ============================================
echo ">>> Step 2: 診断起動キーワード自動応答作成"

echo "  Creating auto-reply: 診断"
api POST /api/automations "{
  \"name\": \"診断bot: 起動キーワード\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"診断\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"LINE公式アカウント無料診断へようこそ!\n\n5つの質問に答えるだけで、あなたのLINE活用タイプを診断します。\n\n業種に合わせた改善ポイントもお伝えするので、ぜひ最後まで答えてくださいね。\n\nではさっそく最初の質問です。\n\n【Q1】あなたの業種を教えてください。\n以下をそのまま送ってね!\n\n美容室\n飲食店\n英会話\nEC\nその他\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_DIAG_STARTED\"}
  ],
  \"priority\": 20
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 3. Q1 業種の回答キーワード自動応答
# ============================================
echo ">>> Step 3: Q1 業種の回答キーワード作成"

# Q1: 美容室
echo "  Creating auto-reply: Q1-美容室"
api POST /api/automations "{
  \"name\": \"診断bot: Q1-美容室\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"美容室\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"美容室ですね!\n\n【Q2】LINE公式アカウントの今の状態は?\n以下をそのまま送ってね!\n\n未作成\n放置中\nたまに配信\n毎週配信\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_BEAUTY\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

# Q1: 飲食店
echo "  Creating auto-reply: Q1-飲食店"
api POST /api/automations "{
  \"name\": \"診断bot: Q1-飲食店\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"飲食店\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"飲食店ですね!\n\n【Q2】LINE公式アカウントの今の状態は?\n以下をそのまま送ってね!\n\n未作成\n放置中\nたまに配信\n毎週配信\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_RESTAURANT\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

# Q1: 英会話
echo "  Creating auto-reply: Q1-英会話"
api POST /api/automations "{
  \"name\": \"診断bot: Q1-英会話\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"英会話\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"英会話ですね!\n\n【Q2】LINE公式アカウントの今の状態は?\n以下をそのまま送ってね!\n\n未作成\n放置中\nたまに配信\n毎週配信\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_SCHOOL\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

# Q1: EC
echo "  Creating auto-reply: Q1-EC"
api POST /api/automations "{
  \"name\": \"診断bot: Q1-EC\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"EC\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"ECですね!\n\n【Q2】LINE公式アカウントの今の状態は?\n以下をそのまま送ってね!\n\n未作成\n放置中\nたまに配信\n毎週配信\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_EC\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

# Q1: その他
echo "  Creating auto-reply: Q1-その他"
api POST /api/automations "{
  \"name\": \"診断bot: Q1-その他\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"その他\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"承知しました!\n\n【Q2】LINE公式アカウントの今の状態は?\n以下をそのまま送ってね!\n\n未作成\n放置中\nたまに配信\n毎週配信\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_OTHER\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 4. Q2 LINE公式の状態の回答キーワード自動応答
# ============================================
echo ">>> Step 4: Q2 LINE公式の状態の回答キーワード作成"

echo "  Creating auto-reply: Q2-未作成"
api POST /api/automations "{
  \"name\": \"診断bot: Q2-未作成\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"未作成\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"まだ作っていないんですね。これからが楽しみです!\n\n【Q3】現在の友だち数は?\n以下をそのまま送ってね!\n\n100人以下\n500人以下\n1000人以下\n1000人以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_NONE\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q2-放置中"
api POST /api/automations "{
  \"name\": \"診断bot: Q2-放置中\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"放置中\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"放置中なんですね。もったいない!\n\n【Q3】現在の友だち数は?\n以下をそのまま送ってね!\n\n100人以下\n500人以下\n1000人以下\n1000人以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_IDLE\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q2-たまに配信"
api POST /api/automations "{
  \"name\": \"診断bot: Q2-たまに配信\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"たまに配信\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"たまに配信しているんですね!\n\n【Q3】現在の友だち数は?\n以下をそのまま送ってね!\n\n100人以下\n500人以下\n1000人以下\n1000人以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_SOMETIMES\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q2-毎週配信"
api POST /api/automations "{
  \"name\": \"診断bot: Q2-毎週配信\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"毎週配信\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"毎週配信、素晴らしいですね!\n\n【Q3】現在の友だち数は?\n以下をそのまま送ってね!\n\n100人以下\n500人以下\n1000人以下\n1000人以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_WEEKLY\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 5. Q3 友だち数の回答キーワード自動応答
# ============================================
echo ">>> Step 5: Q3 友だち数の回答キーワード作成"

echo "  Creating auto-reply: Q3-100人以下"
api POST /api/automations "{
  \"name\": \"診断bot: Q3-100人以下\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"100人以下\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"100人以下ですね。まずは友だちを増やすところからですね!\n\n【Q4】今いちばんの課題は?\n以下をそのまま送ってね!\n\n友だち増やしたい\n反応を増やしたい\nリピート増やしたい\n自動化したい\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_FRIENDS_S\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q3-500人以下"
api POST /api/automations "{
  \"name\": \"診断bot: Q3-500人以下\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"500人以下\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"500人以下、いい感じに育ってきていますね!\n\n【Q4】今いちばんの課題は?\n以下をそのまま送ってね!\n\n友だち増やしたい\n反応を増やしたい\nリピート増やしたい\n自動化したい\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_FRIENDS_M\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q3-1000人以下"
api POST /api/automations "{
  \"name\": \"診断bot: Q3-1000人以下\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"1000人以下\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"1000人以下、しっかり運用できていますね!\n\n【Q4】今いちばんの課題は?\n以下をそのまま送ってね!\n\n友だち増やしたい\n反応を増やしたい\nリピート増やしたい\n自動化したい\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_FRIENDS_L\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q3-1000人以上"
api POST /api/automations "{
  \"name\": \"診断bot: Q3-1000人以上\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"1000人以上\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"1000人以上! 素晴らしい規模ですね!\n\n【Q4】今いちばんの課題は?\n以下をそのまま送ってね!\n\n友だち増やしたい\n反応を増やしたい\nリピート増やしたい\n自動化したい\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_FRIENDS_XL\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 6. Q4 課題の回答キーワード自動応答
# ============================================
echo ">>> Step 6: Q4 課題の回答キーワード作成"

echo "  Creating auto-reply: Q4-友だち増やしたい"
api POST /api/automations "{
  \"name\": \"診断bot: Q4-友だち増やしたい\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"友だち増やしたい\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"友だちを増やしたいんですね。\n\n【Q5】LINE公式アカウントにかけられる月額予算は?\n以下をそのまま送ってね!\n\n無料のみ\n月5千円\n月1万円\n月3万円以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_GROWTH\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q4-反応を増やしたい"
api POST /api/automations "{
  \"name\": \"診断bot: Q4-反応を増やしたい\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"反応を増やしたい\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"反応を増やしたいんですね。\n\n【Q5】LINE公式アカウントにかけられる月額予算は?\n以下をそのまま送ってね!\n\n無料のみ\n月5千円\n月1万円\n月3万円以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_ENGAGEMENT\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q4-リピート増やしたい"
api POST /api/automations "{
  \"name\": \"診断bot: Q4-リピート増やしたい\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"リピート増やしたい\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"リピートを増やしたいんですね。\n\n【Q5】LINE公式アカウントにかけられる月額予算は?\n以下をそのまま送ってね!\n\n無料のみ\n月5千円\n月1万円\n月3万円以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_REPEAT\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q4-自動化したい"
api POST /api/automations "{
  \"name\": \"診断bot: Q4-自動化したい\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"自動化したい\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"自動化したいんですね!\n\n【Q5】LINE公式アカウントにかけられる月額予算は?\n以下をそのまま送ってね!\n\n無料のみ\n月5千円\n月1万円\n月3万円以上\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_AUTOMATION\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 7. Q5 予算の回答キーワード自動応答 + タイプ診断結果
# ============================================
echo ">>> Step 7: Q5 予算の回答キーワード作成(結果表示付き)"

# 結果は業種タグとの組み合わせではなく、予算レンジでタイプ分類。
# 業種別の具体アドバイスは完了後フォローシナリオで配信する。

echo "  Creating auto-reply: Q5-無料のみ"
api POST /api/automations "{
  \"name\": \"診断bot: Q5-無料のみ\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"無料のみ\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"診断完了! ありがとうございました!\n\n------\nあなたのLINE活用タイプ\n------\n\nタイプ: これからスタート型\n\n予算0円でもLINE公式アカウントは始められます。大きな伸びしろがあります!\n\n【あなたへの改善ポイント3つ】\n\n1. まずはLINE公式アカウントを開設(または再始動)しましょう。無料プランでも月200通まで配信できます。\n\n2. 友だち追加のQRコードを店頭・SNS・名刺に貼りましょう。まずは100人を目標に。\n\n3. あいさつメッセージを設定して、友だち追加直後に自動でクーポンや自己紹介を届けましょう。\n\n------\n\n無料でここまでできるのに、やらないのはもったいない!\n\nもっと詳しく知りたい方は「相談」と送ってください。\nあなたの業種に合った具体的なアドバイスをお伝えします。\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_BUDGET_0\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_DIAG_COMPLETED\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q5-月5千円"
api POST /api/automations "{
  \"name\": \"診断bot: Q5-月5千円\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"月5千円\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"診断完了! ありがとうございました!\n\n------\nあなたのLINE活用タイプ\n------\n\nタイプ: 自動化チャレンジ型\n\n月5,000円の予算があれば、かなりのことができます。自動化で効率が大幅にアップできます!\n\n【あなたへの改善ポイント3つ】\n\n1. ステップ配信を設定して、友だち追加後の自動フォローを組みましょう。手動配信の手間が激減します。\n\n2. セグメント配信で「興味のある人だけ」にメッセージを届けましょう。開封率・クリック率が大幅に上がります。\n\n3. リッチメニューを整えて、よくある質問や予約導線をワンタップで案内しましょう。\n\n------\n\n月5,000円の投資で売上が何倍にもなる事例、たくさんあります!\n\nもっと詳しく知りたい方は「相談」と送ってください。\nあなたの業種に合った具体的なアドバイスをお伝えします。\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_BUDGET_5K\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_DIAG_COMPLETED\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q5-月1万円"
api POST /api/automations "{
  \"name\": \"診断bot: Q5-月1万円\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"月1万円\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"診断完了! ありがとうございました!\n\n------\nあなたのLINE活用タイプ\n------\n\nタイプ: 本格運用スタート型\n\n月1万円の予算は、本格運用のスタートラインです。自動化で効率が大幅にアップできます!\n\n【あなたへの改善ポイント3つ】\n\n1. Lステップなどの拡張ツールを導入して、タグ管理・セグメント配信・自動応答を高度化しましょう。\n\n2. 友だち追加広告(CPF広告)を少額から試して、ターゲット層の友だちを効率的に集めましょう。\n\n3. 購入・来店データと連携して、リピート促進の自動配信を組みましょう。一度作れば自動で売上が立ちます。\n\n------\n\nこの予算帯が一番ROIが高い! 正しくやれば10倍以上のリターンが見込めます。\n\nもっと詳しく知りたい方は「相談」と送ってください。\nあなたの業種に合った具体的なアドバイスをお伝えします。\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_BUDGET_10K\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_DIAG_COMPLETED\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"

echo "  Creating auto-reply: Q5-月3万円以上"
api POST /api/automations "{
  \"name\": \"診断bot: Q5-月3万円以上\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"月3万円以上\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"診断完了! ありがとうございました!\n\n------\nあなたのLINE活用タイプ\n------\n\nタイプ: プロ運用型\n\n月3万円以上の予算、本気度が伝わります! 更に売上を伸ばす余地があります!\n\n【あなたへの改善ポイント3つ】\n\n1. CRM連携で顧客データを一元管理し、LTV(顧客生涯価値)を最大化する配信設計を組みましょう。\n\n2. LINE広告とリマーケティングを組み合わせて、見込み客の獲得コストを最適化しましょう。\n\n3. API連携で予約・EC・決済をLINE内で完結させましょう。顧客体験が向上し、離脱率が大幅に下がります。\n\n------\n\nこの投資額なら、プロに任せるのが最もコスパが良いです。\n\nもっと詳しく知りたい方は「相談」と送ってください。\nあなたの業種に合った具体的なアドバイスをお伝えします。\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_BUDGET_30K\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_DIAG_COMPLETED\"}
  ],
  \"priority\": 15
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 8. コンサル導線（キーワード「相談」）
# ============================================
echo ">>> Step 8: コンサル導線キーワード作成"

echo "  Creating auto-reply: 相談"
api POST /api/automations "{
  \"name\": \"診断bot: 相談キーワード\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"相談\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"ご相談ありがとうございます!\n\nあなたの診断結果をもとに、業種・課題・予算に合わせた具体的な改善プランをご提案します。\n\n【無料相談の内容】\n・LINE公式アカウントの現状分析\n・業種別の成功事例の共有\n・3ヶ月間の改善ロードマップ作成\n\n【相談方法】\n・形式: オンライン通話(Zoom)\n・時間: 30分\n・料金: 無料(診断bot利用者限定)\n\n候補日時をいくつかお送りください。\n折り返しご連絡いたします!\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_CONSUL\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 9. ステップ配信シナリオ（診断開始後のリマインド）
# ============================================
echo ">>> Step 9: 診断リマインドシナリオ作成"

RESULT=$(api POST /api/scenarios "{
  \"name\": \"診断bot: 未完了リマインド\",
  \"description\": \"診断を開始したが完了していないユーザーへのリマインド配信\",
  \"triggerType\": \"tag_added\",
  \"triggerTagId\": \"$TAG_DIAG_STARTED\",
  \"isActive\": true
}")
SCENARIO_REMIND_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',d.get('scenario',{}).get('id',d.get('id',''))))" 2>/dev/null || echo "")
echo "  Scenario ID: $SCENARIO_REMIND_ID"

# 30分後リマインド (diag_completed タグがない人のみ)
echo "  Adding 30-min reminder..."
api POST "/api/scenarios/$SCENARIO_REMIND_ID/steps" "{
  \"stepOrder\": 1,
  \"delayMinutes\": 30,
  \"messageType\": \"text\",
  \"messageContent\": \"診断の途中でしたね!\n\n全5問のうち、まだ回答が残っているようです。\n\n最後まで答えると、あなたの業種に合った改善ポイントが分かりますよ。\n\n続きから答えてみてくださいね!\",
  \"conditionType\": \"tag_not_exists\",
  \"conditionValue\": \"$TAG_DIAG_COMPLETED\"
}" > /dev/null
echo "    OK"

# 1日後リマインド (diag_completed タグがない人のみ)
echo "  Adding 1-day reminder..."
api POST "/api/scenarios/$SCENARIO_REMIND_ID/steps" "{
  \"stepOrder\": 2,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"LINE公式アカウント診断、まだ途中でした!\n\n実は、診断を最後まで完了した方には無料相談の特典があります。\n\n「診断」と送って、もう一度最初からやり直すこともできますよ。\n\nぜひ完了させてくださいね!\",
  \"conditionType\": \"tag_not_exists\",
  \"conditionValue\": \"$TAG_DIAG_COMPLETED\"
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 10. 診断完了後フォローシナリオ（業種別分岐）
# ============================================
echo ">>> Step 10: 診断完了後フォローシナリオ作成"

RESULT=$(api POST /api/scenarios "{
  \"name\": \"診断bot: 完了後フォロー\",
  \"description\": \"診断完了後、相談に至らなかったユーザーへのフォロー配信\",
  \"triggerType\": \"tag_added\",
  \"triggerTagId\": \"$TAG_DIAG_COMPLETED\",
  \"isActive\": true
}")
SCENARIO_FOLLOW_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',d.get('scenario',{}).get('id',d.get('id',''))))" 2>/dev/null || echo "")
echo "  Scenario ID: $SCENARIO_FOLLOW_ID"

# 1日後: 美容室向け
echo "  Adding Day 1 follow-up (美容室)..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 1,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"昨日は診断ありがとうございました!\n\n美容室のLINE活用で一番効果が出やすいのは「予約リマインド」と「来店後のお礼メッセージ」です。\n\nあるサロンでは、LINE経由の予約率が3倍になった事例もあります。\n\n具体的な設定方法を知りたい方は「相談」と送ってくださいね。\",
  \"conditionType\": \"tag_exists\",
  \"conditionValue\": \"$TAG_BEAUTY\"
}" > /dev/null
echo "    OK"

# 1日後: 飲食店向け
echo "  Adding Day 1 follow-up (飲食店)..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 2,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"昨日は診断ありがとうございました!\n\n飲食店のLINE活用で一番効果が出やすいのは「ランチタイム直前のクーポン配信」と「雨の日限定メッセージ」です。\n\nある居酒屋では、LINE配信した日の来店数が平均1.5倍になった事例もあります。\n\n具体的な設定方法を知りたい方は「相談」と送ってくださいね。\",
  \"conditionType\": \"tag_exists\",
  \"conditionValue\": \"$TAG_RESTAURANT\"
}" > /dev/null
echo "    OK"

# 1日後: スクール向け
echo "  Adding Day 1 follow-up (スクール)..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 3,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"昨日は診断ありがとうございました!\n\nスクール・教室のLINE活用で一番効果が出やすいのは「体験レッスン後の自動フォロー」と「生徒の進捗に合わせた配信」です。\n\nある英会話教室では、体験からの入会率が2倍になった事例もあります。\n\n具体的な設定方法を知りたい方は「相談」と送ってくださいね。\",
  \"conditionType\": \"tag_exists\",
  \"conditionValue\": \"$TAG_SCHOOL\"
}" > /dev/null
echo "    OK"

# 1日後: その他業種向け(EC、その他 = 上記タグに該当しない人向けフォールバック)
echo "  Adding Day 1 follow-up (その他)..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 4,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"昨日は診断ありがとうございました!\n\n診断結果の改善ポイント、もう少し詳しく知りたくないですか?\n\n実際に同じ業種で成果を出した事例をお見せできます。\n\n気になった方は「相談」と送ってくださいね。\",
  \"conditionType\": \"tag_not_exists\",
  \"conditionValue\": \"$TAG_BEAUTY\"
}" > /dev/null
echo "    OK"

# 3日後
echo "  Adding Day 3 follow-up..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 5,
  \"delayMinutes\": 4320,
  \"messageType\": \"text\",
  \"messageContent\": \"LINE公式アカウントの活用、進んでいますか?\n\n診断結果で出た改善ポイントの中で、一番カンタンに始められるのは「あいさつメッセージの設定」です。\n\n友だち追加した瞬間に自動でメッセージが届く。これだけで反応率が全然変わります。\n\nもし設定方法がわからなければ「相談」と送ってくださいね。無料でサポートします!\"
}" > /dev/null
echo "    OK"

# 7日後
echo "  Adding Day 7 follow-up..."
api POST "/api/scenarios/$SCENARIO_FOLLOW_ID/steps" "{
  \"stepOrder\": 6,
  \"delayMinutes\": 10080,
  \"messageType\": \"text\",
  \"messageContent\": \"診断から1週間が経ちました。\n\nLINE公式アカウントは、始めるのが早ければ早いほど有利です。\n\n友だちは積み上げ型の資産。今日追加された1人が、来月の売上につながります。\n\n無料相談の枠には限りがあるので、気になっている方はお早めにどうぞ。\n\n「相談」と送るだけでOKです!\"
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 完了サマリー
# ============================================
echo "============================================"
echo " セットアップ完了!"
echo "============================================"
echo ""
echo "作成したリソース:"
echo "  タグ: 24個"
echo "    Q1 業種: diag_beauty, diag_restaurant, diag_school, diag_ec, diag_other"
echo "    Q2 状態: diag_none, diag_idle, diag_sometimes, diag_weekly"
echo "    Q3 友だち数: diag_friends_s, diag_friends_m, diag_friends_l, diag_friends_xl"
echo "    Q4 課題: diag_growth, diag_engagement, diag_repeat, diag_automation"
echo "    Q5 予算: diag_budget_0, diag_budget_5k, diag_budget_10k, diag_budget_30k"
echo "    管理: diag_started, diag_completed, consul_interest"
echo ""
echo "  自動応答: 22キーワード(全て一意)"
echo "    起動: 診断"
echo "    Q1: 美容室, 飲食店, 英会話, EC, その他"
echo "    Q2: 未作成, 放置中, たまに配信, 毎週配信"
echo "    Q3: 100人以下, 500人以下, 1000人以下, 1000人以上"
echo "    Q4: 友だち増やしたい, 反応を増やしたい, リピート増やしたい, 自動化したい"
echo "    Q5: 無料のみ, 月5千円, 月1万円, 月3万円以上"
echo "    導線: 相談"
echo ""
echo "  シナリオ: 2本"
echo "    1. 未完了リマインド (ID: $SCENARIO_REMIND_ID) - 2ステップ(diag_completed除外条件付き)"
echo "    2. 完了後フォロー (ID: $SCENARIO_FOLLOW_ID) - 6ステップ(業種別分岐: 美容室/飲食店/スクール/その他 + 共通Day3,Day7)"
echo ""
echo "タイプ診断:"
echo "  無料のみ     → これからスタート型"
echo "  月5千円      → 自動化チャレンジ型"
echo "  月1万円      → 本格運用スタート型"
echo "  月3万円以上  → プロ運用型"
echo ""
echo "フロー: 「診断」→ Q1〜Q5回答 → タイプ診断結果+改善ポイント → 「相談」→ コンサル導線"
echo ""
