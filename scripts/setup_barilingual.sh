#!/bin/bash
# ============================================================
# Barilingual (バリリンガル) Setup Script
# ============================================================
# english-school テンプレートパックを LINE Harness API に投入し、
# バリリンガル固有のプレースホルダーを実際の値に置換する。
#
# Usage:
#   API_BASE=http://localhost:8787 API_TOKEN=your-api-key bash scripts/setup_barilingual.sh
#
# 前提: worker が起動済み、DB マイグレーション適用済み
# ============================================================

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8787}"
API_TOKEN="${API_TOKEN:?Set API_TOKEN env var}"
TEMPLATE_DIR="$(cd "$(dirname "$0")/../templates/english-school" && pwd)"

echo "============================================"
echo " Barilingual Setup"
echo " API: $API_BASE"
echo " Template: $TEMPLATE_DIR"
echo "============================================"
echo ""

# ---- バリリンガル固有の置換マップ ----
declare -A PLACEHOLDERS=(
  ["__SCHOOL_NAME__"]="バリリンガル"
  ["__SCHOOL_IMAGE_URL__"]="https://placehold.co/800x520/10B981/FFFFFF?text=Barilingual"
  ["__BOOKING_URL__"]="https://barilingual.com/booking"
  ["__LIFF_FORM_URL__"]="https://liff.line.me/YOUR_LIFF_ID"
  ["__PRICE_4__"]="12,800"
  ["__PRICE_8__"]="22,800"
  ["__PRICE_UNLIMITED__"]="39,800"
  ["__PHONE_NUMBER__"]="03-XXXX-XXXX"
  ["__ADDRESS__"]="東京都渋谷区XX-XX-XX"
  ["__STATION__"]="渋谷駅 徒歩5分"
  ["__HOURS__"]="10:00-21:00"
  ["__MAP_URL__"]="https://maps.google.com/?q=barilingual"
  ["__ONLINE_ANSWER__"]="はい、Zoomでのオンラインレッスンも対応しています。"
  ["__TESTIMONIAL_NAME__"]="山田太郎"
  ["__TESTIMONIAL_NAME_2__"]="佐藤花子"
)

# ---- Helper: プレースホルダー置換 ----
replace_placeholders() {
  local text="$1"
  for key in "${!PLACEHOLDERS[@]}"; do
    text="${text//$key/${PLACEHOLDERS[$key]}}"
  done
  echo "$text"
}

# ---- Helper: API POST ----
api_post() {
  local path="$1" data="$2"
  curl -s -X POST "$API_BASE$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "$data"
}

# ---- Helper: JSON から id を抽出 ----
extract_id() {
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])"
}

echo ">>> [1/6] Creating tags..."
declare -A TAG_IDS
while IFS= read -r tag_json; do
  name=$(echo "$tag_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  color=$(echo "$tag_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['color'])")
  result=$(api_post "/api/tags" "{\"name\":\"$name\",\"color\":\"$color\"}")
  id=$(echo "$result" | extract_id)
  TAG_IDS["$name"]="$id"
  echo "  Tag: $name -> $id"
done < <(python3 -c "
import json
with open('$TEMPLATE_DIR/tags.json') as f:
  for t in json.load(f):
    print(json.dumps(t))
")
echo ""

echo ">>> [2/6] Creating conversion points..."
declare -A CV_IDS
while IFS= read -r cv_json; do
  result=$(api_post "/api/conversions/points" "$cv_json")
  name=$(echo "$cv_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  id=$(echo "$result" | extract_id)
  CV_IDS["$name"]="$id"
  echo "  CV Point: $name -> $id"
done < <(python3 -c "
import json
with open('$TEMPLATE_DIR/conversion-points.json') as f:
  for cp in json.load(f):
    print(json.dumps(cp))
")
echo ""

echo ">>> [3/6] Creating scoring rules..."
while IFS= read -r rule_json; do
  result=$(api_post "/api/scoring-rules" "$rule_json")
  name=$(echo "$rule_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  Scoring Rule: $name"
done < <(python3 -c "
import json
with open('$TEMPLATE_DIR/scoring-rules.json') as f:
  for r in json.load(f):
    print(json.dumps(r))
")
echo ""

echo ">>> [4/6] Creating auto-replies..."
while IFS= read -r reply_json; do
  # プレースホルダー置換
  replaced=$(replace_placeholders "$reply_json")
  result=$(api_post "/api/automations" "$(python3 -c "
import json, sys
r = json.loads('''$replaced''')
# auto_replies -> automations で event_type=message_received として登録
auto = {
  'name': 'Auto: ' + r['keyword'],
  'eventType': 'message_received',
  'conditions': json.dumps({'message_text': r['keyword'], 'match_type': r.get('matchType','exact')}),
  'actions': json.dumps([{'type': 'reply', 'responseType': r['responseType'], 'responseContent': r['responseContent']}]),
  'isActive': r.get('isActive', True),
  'priority': 0
}
print(json.dumps(auto))
")")
  keyword=$(echo "$reply_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['keyword'])")
  echo "  Auto-reply: $keyword"
done < <(python3 -c "
import json
with open('$TEMPLATE_DIR/auto-replies.json') as f:
  for r in json.load(f):
    print(json.dumps(r))
")
echo ""

echo ">>> [5/6] Creating scenarios..."
# シナリオJSON内のプレースホルダー（タグID + バリリンガル固有値）を置換
SCENARIOS_RAW=$(cat "$TEMPLATE_DIR/scenarios.json")

# タグIDプレースホルダーを置換
for tag_name in "${!TAG_IDS[@]}"; do
  placeholder="__TAG_ID_${tag_name}__"
  SCENARIOS_RAW="${SCENARIOS_RAW//$placeholder/${TAG_IDS[$tag_name]}}"
done

# CVポイントIDプレースホルダーを置換
for cv_name in "${!CV_IDS[@]}"; do
  placeholder="__CV_POINT_ID_${cv_name}__"
  SCENARIOS_RAW="${SCENARIOS_RAW//$placeholder/${CV_IDS[$cv_name]}}"
done

# バリリンガル固有プレースホルダーを置換
SCENARIOS_RAW=$(replace_placeholders "$SCENARIOS_RAW")

# 各シナリオを投入
python3 -c "
import json, subprocess, sys

data = json.loads('''$(echo "$SCENARIOS_RAW" | sed "s/'/'\\\\''/g")''')
scenarios = data.get('scenarios', data) if isinstance(data, dict) else data

for s in scenarios:
    payload = {
        'name': s['name'],
        'description': s.get('description', ''),
        'triggerType': s['triggerType'],
        'isActive': s.get('isActive', True),
    }
    if 'triggerTagId' in s and not s['triggerTagId'].startswith('__'):
        payload['triggerTagId'] = s['triggerTagId']

    # Create scenario
    result = subprocess.run(
        ['curl', '-s', '-X', 'POST', '$API_BASE/api/scenarios',
         '-H', 'Content-Type: application/json',
         '-H', 'Authorization: Bearer $API_TOKEN',
         '-d', json.dumps(payload)],
        capture_output=True, text=True
    )
    try:
        scenario_id = json.loads(result.stdout)['data']['id']
        print(f'  Scenario: {s[\"name\"]} -> {scenario_id}')

        # Create steps
        for step in s.get('steps', []):
            step_payload = {
                'stepOrder': step['stepOrder'],
                'delayMinutes': step['delayMinutes'],
                'messageType': step['messageType'],
                'messageContent': step['messageContent'],
            }
            subprocess.run(
                ['curl', '-s', '-X', 'POST', f'$API_BASE/api/scenarios/{scenario_id}/steps',
                 '-H', 'Content-Type: application/json',
                 '-H', 'Authorization: Bearer $API_TOKEN',
                 '-d', json.dumps(step_payload)],
                capture_output=True, text=True
            )
        print(f'    -> {len(s.get(\"steps\", []))} steps created')
    except Exception as e:
        print(f'  ERROR creating scenario {s[\"name\"]}: {e}', file=sys.stderr)
        print(f'  Response: {result.stdout}', file=sys.stderr)
"
echo ""

echo ">>> [6/6] Creating forms..."
python3 -c "
import json, subprocess, sys

with open('$TEMPLATE_DIR/forms.json') as f:
    forms = json.load(f)

for form in forms:
    payload = {
        'name': form['name'],
        'description': form.get('description', ''),
        'fields': form['fields'],
    }
    result = subprocess.run(
        ['curl', '-s', '-X', 'POST', '$API_BASE/api/forms',
         '-H', 'Content-Type: application/json',
         '-H', 'Authorization: Bearer $API_TOKEN',
         '-d', json.dumps(payload)],
        capture_output=True, text=True
    )
    try:
        form_id = json.loads(result.stdout)['data']['id']
        print(f'  Form: {form[\"name\"]} -> {form_id}')
    except Exception as e:
        print(f'  ERROR creating form {form[\"name\"]}: {e}', file=sys.stderr)
        print(f'  Response: {result.stdout}', file=sys.stderr)
"
echo ""

echo "============================================"
echo " Setup complete!"
echo ""
echo " Tag IDs created:"
for name in "${!TAG_IDS[@]}"; do
  echo "   $name = ${TAG_IDS[$name]}"
done
echo ""
echo " CV Point IDs created:"
for name in "${!CV_IDS[@]}"; do
  echo "   $name = ${CV_IDS[$name]}"
done
echo ""
echo " Next steps:"
echo "   1. Rich Menu: POST /api/rich-menus (see templates/english-school/rich-menu.json)"
echo "   2. Update LIFF URL in scenarios if needed"
echo "   3. Set LINE channel credentials: wrangler secret put LINE_CHANNEL_ACCESS_TOKEN"
echo "============================================"
