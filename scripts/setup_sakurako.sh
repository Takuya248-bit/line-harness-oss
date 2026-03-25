#!/bin/bash
# 櫻子さん LINE Harness セットアップスクリプト
# Usage: bash scripts/setup_sakurako.sh

set -e

API_BASE="${API_BASE:-https://line-crm-worker.YOUR_SUBDOMAIN.workers.dev}"
API_KEY="${API_KEY:?ERROR: API_KEY environment variable is required. Set it with: export API_KEY=your_api_key}"

api() {
  local method=$1 path=$2 data=$3
  curl -s -X "$method" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    ${data:+-d "$data"} \
    "$API_BASE$path"
}

echo "============================================"
echo " 櫻子さん LINE Harness セットアップ"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ============================================
# 1. タグ作成
# ============================================
echo ">>> Step 1: タグ作成"

TAG_IDS=()
TAG_NAMES=("友だち追加" "コンサル興味" "note購入者" "コンサル申込済" "配信停止")
TAG_COLORS=("#3B82F6" "#10B981" "#F59E0B" "#EF4444" "#64748B")

for i in "${!TAG_NAMES[@]}"; do
  echo "  Creating tag: ${TAG_NAMES[$i]}"
  RESULT=$(api POST /api/tags "{\"name\":\"${TAG_NAMES[$i]}\",\"color\":\"${TAG_COLORS[$i]}\"}")
  TAG_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tag',{}).get('id',d.get('id','')))" 2>/dev/null || echo "")
  if [ -z "$TAG_ID" ]; then
    echo "    WARN: Could not extract tag ID. Response: $RESULT"
    TAG_ID="UNKNOWN"
  else
    echo "    OK: id=$TAG_ID"
  fi
  TAG_IDS+=("$TAG_ID")
done

TAG_TOMODACHI=${TAG_IDS[0]}
TAG_CONSUL_INTEREST=${TAG_IDS[1]}
TAG_NOTE_BUYER=${TAG_IDS[2]}
TAG_CONSUL_APPLIED=${TAG_IDS[3]}
TAG_STOP=${TAG_IDS[4]}

echo ""
echo "Tag IDs:"
echo "  友だち追加: $TAG_TOMODACHI"
echo "  コンサル興味: $TAG_CONSUL_INTEREST"
echo "  note購入者: $TAG_NOTE_BUYER"
echo "  コンサル申込済: $TAG_CONSUL_APPLIED"
echo "  配信停止: $TAG_STOP"
echo ""

# ============================================
# 2. シナリオ1: 友だち追加シナリオ（7日間）
# ============================================
echo ">>> Step 2: 友だち追加シナリオ作成"

RESULT=$(api POST /api/scenarios "{
  \"name\": \"友だち追加シナリオ（7日間ステップ配信）\",
  \"description\": \"友だち追加後、7日間かけてコンサルへ誘導\",
  \"triggerType\": \"friend_add\",
  \"isActive\": true
}")
SCENARIO1_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('scenario',{}).get('id',d.get('id','')))" 2>/dev/null || echo "")
echo "  Scenario ID: $SCENARIO1_ID"

# Day 0 (即時)
echo "  Adding Day 0 step..."
api POST "/api/scenarios/$SCENARIO1_ID/steps" "{
  \"stepOrder\": 1,
  \"delayMinutes\": 0,
  \"messageType\": \"text\",
  \"messageContent\": \"友だち追加ありがとう!\n\\\"酒と旅ゆく櫻子チャン\\\"の公式LINEへようこそ🍺\n\nここでは、YouTubeでは話せない\nリアルなショート動画の裏側を配信してるよ!\n\nまずはお礼に、今すぐ使えるプレゼントを用意しました。\n\n▼ショート動画で最初の1万再生を取るチェックリスト（PDF）\n→ 受け取りはこちら: __PDF_URL__\"
}" > /dev/null
echo "    OK"

# Day 1 (1日後 = 1440分)
echo "  Adding Day 1 step..."
api POST "/api/scenarios/$SCENARIO1_ID/steps" "{
  \"stepOrder\": 2,
  \"delayMinutes\": 1440,
  \"messageType\": \"text\",
  \"messageContent\": \"昨日は登録ありがとう!\n\nちょっと自己紹介させてね。\n\n私はショート動画に特化して\n約1年半で登録者30万人まで伸ばしました。\n\nでも最初から順調だったわけじゃなくて\n投稿しても全然回らない時期もあった。\n\nそこから何を変えたのか、\nこのLINEで少しずつ話していくね。\n\n明日は「伸びない人がやりがちなNG3選」を送るよ!\"
}" > /dev/null
echo "    OK"

# Day 3 (3日後 = 4320分)
echo "  Adding Day 3 step..."
api POST "/api/scenarios/$SCENARIO1_ID/steps" "{
  \"stepOrder\": 3,
  \"delayMinutes\": 4320,
  \"messageType\": \"text\",
  \"messageContent\": \"伸びない人がやりがちなこと、知ってる?\n\n1. 冒頭3秒に全力を入れてない\n2. 「良い動画」を作ろうとしてる（止まる動画じゃなくて）\n3. データを見ずに感覚で投稿してる\n\nこれ、昔の私もやってたやつ。\n\nYouTubeは運ゲーじゃなくて構造ゲー。\n構造がわかれば、再現性が生まれるよ。\n\nもっと詳しく知りたい人は\nnoteに全部書いたから読んでみてね。\n\n▼約1年半で登録者30万人に伸ばしたショート動画戦略\n→ __NOTE_URL__\"
}" > /dev/null
echo "    OK"

# Day 5 (5日後 = 7200分)
echo "  Adding Day 5 step..."
api POST "/api/scenarios/$SCENARIO1_ID/steps" "{
  \"stepOrder\": 4,
  \"delayMinutes\": 7200,
  \"messageType\": \"text\",
  \"messageContent\": \"ここまで読んでくれてありがとう!\n\nちょっと聞いてもいい?\n\n今こんなことで悩んでない?\n\n・毎日投稿してるのに伸びない\n・編集に時間かけてるのに再生されない\n・収益化したいけど何から手をつければ...\n・にじさんじのオーディション受けたいけど不安\n\nもし当てはまるなら、\n私のコンサルで一緒に解決できるかも。\n\n30分のスポットコンサルで\nあなたのチャンネルを見て、具体的にアドバイスするよ。\n\n気になったら「コンサル」って送ってね!\"
}" > /dev/null
echo "    OK"

# Day 7 (7日後 = 10080分)
echo "  Adding Day 7 step..."
api POST "/api/scenarios/$SCENARIO1_ID/steps" "{
  \"stepOrder\": 5,
  \"delayMinutes\": 10080,
  \"messageType\": \"text\",
  \"messageContent\": \"最後にひとつだけ。\n\nこのLINEに登録してくれたってことは\nYouTubeを本気でやりたい人だと思う。\n\n私は200件以上のアカウント運用を支援してきて\nひとつだけ確信してることがある。\n\n「伸びないのは努力不足じゃなくて、努力の方向のズレ」\n\n方向さえ合えば、あとは積み上げるだけ。\n\n今月は限定でスポットコンサルの枠を開けてるので\n気になったら「コンサル」って送ってね。\n\nそれじゃ、また配信で!🍺\"
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 3. シナリオ2: コンサル申込フォロー
# ============================================
echo ">>> Step 3: コンサル申込フォローシナリオ作成"

RESULT=$(api POST /api/scenarios "{
  \"name\": \"コンサル申込フォロー\",
  \"description\": \"コンサル興味タグ追加後のフォロー配信\",
  \"triggerType\": \"tag_added\",
  \"triggerTagId\": \"$TAG_CONSUL_INTEREST\",
  \"isActive\": true
}")
SCENARIO2_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('scenario',{}).get('id',d.get('id','')))" 2>/dev/null || echo "")
echo "  Scenario ID: $SCENARIO2_ID"

# 即時
echo "  Adding immediate step..."
api POST "/api/scenarios/$SCENARIO2_ID/steps" "{
  \"stepOrder\": 1,
  \"delayMinutes\": 0,
  \"messageType\": \"text\",
  \"messageContent\": \"コンサルに興味を持ってくれてありがとう!\n\n私のコンサルは3つのプランがあるよ。\n\n1. 30分スポットコンサル\n→ 今のチャンネルの課題を一緒に分析して、具体的な改善策を出す\n\n2. コンサルレポート制作\n→ あなたのチャンネルを徹底分析して、改善点・企画案・収益化ルートを書面で納品\n\n3. オーディション対策レポート\n→ にじさんじ等の事務所別ノウハウ+応募フォーム添削\n\nどれが気になる?\n番号で教えてね!\"
}" > /dev/null
echo "    OK"

# 3日後フォロー
echo "  Adding 3-day follow-up..."
api POST "/api/scenarios/$SCENARIO2_ID/steps" "{
  \"stepOrder\": 2,
  \"delayMinutes\": 4320,
  \"messageType\": \"text\",
  \"messageContent\": \"コンサルの件、検討中かな?\n\nちなみにnoteの有料記事を読んでくれた人は\n「note読者割」が使えるよ!\n\nまだ読んでない人は先にこっちを見てみてね。\n2,980円で全部の戦略が読めるから。\n\n▼約1年半で登録者30万人に伸ばしたショート動画戦略\n→ __NOTE_URL__\"
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 4. シナリオ3: note購入者フォロー
# ============================================
echo ">>> Step 4: note購入者フォローシナリオ作成"

RESULT=$(api POST /api/scenarios "{
  \"name\": \"note購入者フォロー\",
  \"description\": \"note購入タグ追加後のフォロー配信\",
  \"triggerType\": \"tag_added\",
  \"triggerTagId\": \"$TAG_NOTE_BUYER\",
  \"isActive\": true
}")
SCENARIO3_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('scenario',{}).get('id',d.get('id','')))" 2>/dev/null || echo "")
echo "  Scenario ID: $SCENARIO3_ID"

# 即時
echo "  Adding immediate step..."
api POST "/api/scenarios/$SCENARIO3_ID/steps" "{
  \"stepOrder\": 1,
  \"delayMinutes\": 0,
  \"messageType\": \"text\",
  \"messageContent\": \"noteご購入ありがとう!\n\n記事の内容で質問があれば\nいつでもこのLINEに送ってね。\n\nあと、記事を読んだ感想も聞かせてくれると嬉しいな。\n\nnote読者は特別価格でコンサルも受けられるよ。\n気になったら「コンサル」って送ってね!\"
}" > /dev/null
echo "    OK"

# 7日後フォロー
echo "  Adding 7-day follow-up..."
api POST "/api/scenarios/$SCENARIO3_ID/steps" "{
  \"stepOrder\": 2,
  \"delayMinutes\": 10080,
  \"messageType\": \"text\",
  \"messageContent\": \"note読んでみてどうだった?\n\n読んだだけで終わらせるのはもったいない!\n\n実際に自分のチャンネルで試してみて\nわからないことがあればいつでも聞いてね。\n\n特にこの3つは今日からできるよ:\n・冒頭3秒の設計を変えてみる\n・タイトルをリサーチベースで考えてみる\n・伸びた動画の構造を分析してみる\"
}" > /dev/null
echo "    OK"
echo ""

# ============================================
# 5. 自動応答（Automations）
# ============================================
echo ">>> Step 5: 自動応答キーワード作成"

# コンサル
echo "  Creating auto-reply: コンサル"
api POST /api/automations "{
  \"name\": \"キーワード応答: コンサル\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"コンサル\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"コンサルに興味を持ってくれてありがとう!\n\n私のコンサルは3つのプランがあるよ。\n\n1. 30分スポットコンサル\n→ 今のチャンネルの課題を一緒に分析して、具体的な改善策を出す\n\n2. コンサルレポート制作\n→ あなたのチャンネルを徹底分析して、改善点・企画案・収益化ルートを書面で納品\n\n3. オーディション対策レポート\n→ にじさんじ等の事務所別ノウハウ+応募フォーム添削\n\nどれが気になる?\n番号で教えてね!\"},
    {\"type\": \"add_tag\", \"tagId\": \"$TAG_CONSUL_INTEREST\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"

# 料金
echo "  Creating auto-reply: 料金"
api POST /api/automations "{
  \"name\": \"キーワード応答: 料金\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"料金\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"各プランの料金はこちら!\n\n1. 30分スポットコンサル: __PRICE_SPOT__\n2. コンサルレポート制作: __PRICE_REPORT__\n3. オーディション対策レポート: __PRICE_AUDITION__\n\nnote読者は特別割引あり!\n\n気になるプランがあれば番号で教えてね!\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"

# note
echo "  Creating auto-reply: note"
api POST /api/automations "{
  \"name\": \"キーワード応答: note\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"note\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"noteの有料記事はこちら!\n\n▼約1年半で登録者30万人に伸ばしたショート動画戦略\n→ __NOTE_URL__\n\n2,980円で、私がやってきた全戦略を公開してるよ。\n\n・冒頭3秒の設計テクニック\n・データ分析の方法\n・収益化ルートの作り方\n\n読んだ人はコンサルの割引もあるよ!\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"

# オーディション
echo "  Creating auto-reply: オーディション"
api POST /api/automations "{
  \"name\": \"キーワード応答: オーディション\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"オーディション\", \"matchType\": \"contains\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"オーディション対策レポートに興味があるんだね!\n\nにじさんじをはじめ、事務所別のノウハウと\n応募フォームの添削をセットでお届けするよ。\n\n・事務所が求める人物像の分析\n・自己PR文の書き方\n・ポートフォリオの見せ方\n\n詳しく聞きたかったら「コンサル」って送ってね!\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"

# にじさんじ
echo "  Creating auto-reply: にじさんじ"
api POST /api/automations "{
  \"name\": \"キーワード応答: にじさんじ\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"にじさんじ\", \"matchType\": \"contains\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"にじさんじのオーディション対策、人気だよ!\n\n私のオーディション対策レポートでは\nにじさんじ特化の分析もやってるよ。\n\n・過去の合格者の傾向分析\n・自己PR・応募動画のポイント\n・フォーム記入のコツ\n\n気になったら「コンサル」って送ってね!\"}
  ],
  \"priority\": 9
}" > /dev/null
echo "    OK"

# 実績
echo "  Creating auto-reply: 実績"
api POST /api/automations "{
  \"name\": \"キーワード応答: 実績\",
  \"eventType\": \"message_received\",
  \"conditions\": {\"keyword\": \"実績\", \"matchType\": \"exact\"},
  \"actions\": [
    {\"type\": \"reply\", \"messageType\": \"text\", \"content\": \"私の実績を紹介するね!\n\nチャンネル「酒と旅ゆく櫻子チャン」\n・登録者: 約32万人\n・総再生回数: 5億回以上\n・ショート動画に特化して約1年半で達成\n\nコンサル実績:\n・200件以上のアカウント運用支援\n・ジャンル問わず再生数改善\n・にじさんじ等のオーディション対策も\n\n気になったら「コンサル」って送ってね!\"}
  ],
  \"priority\": 10
}" > /dev/null
echo "    OK"

echo ""
echo "============================================"
echo " セットアップ完了!"
echo "============================================"
echo ""
echo "作成したリソース:"
echo "  タグ: 5個"
echo "  シナリオ: 3本"
echo "    1. 友だち追加シナリオ (ID: $SCENARIO1_ID) - 5ステップ"
echo "    2. コンサル申込フォロー (ID: $SCENARIO2_ID) - 2ステップ"
echo "    3. note購入者フォロー (ID: $SCENARIO3_ID) - 2ステップ"
echo "  自動応答: 6キーワード"
echo ""
echo "プレースホルダー（後で更新が必要）:"
echo "  __PDF_URL__     - 無料特典PDFのダウンロードURL"
echo "  __NOTE_URL__    - noteの有料記事URL"
echo "  __PRICE_SPOT__  - スポットコンサル料金"
echo "  __PRICE_REPORT__ - レポート制作料金"
echo "  __PRICE_AUDITION__ - オーディション対策料金"
echo ""
