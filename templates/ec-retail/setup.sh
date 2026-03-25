#!/bin/bash
# EC/Retail Template Pack - Setup Script
# Usage: API_BASE=https://your.workers.dev API_TOKEN=xxx bash setup.sh

set -euo pipefail

API_BASE="${API_BASE:?Set API_BASE env var}"
API_TOKEN="${API_TOKEN:?Set API_TOKEN env var}"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== EC/Retail Template Pack ==="
echo "API: $API_BASE"
echo ""

api_post() {
  local path="$1" data="$2"
  curl -s -X POST "$API_BASE$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "$data"
}

# --- 1. Tags ---
echo ">>> Creating tags..."
declare -A TAG_IDS
while IFS= read -r tag_json; do
  name=$(echo "$tag_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  color=$(echo "$tag_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['color'])")
  result=$(api_post "/api/tags" "{\"name\":\"$name\",\"color\":\"$color\"}")
  id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
  TAG_IDS["$name"]="$id"
  echo "  Tag: $name -> $id"
done < <(python3 -c "
import json
with open('$DIR/tags.json') as f:
  for t in json.load(f):
    print(json.dumps(t))
")

# --- 2. Conversion Points ---
echo ">>> Creating conversion points..."
declare -A CV_IDS
while IFS= read -r cv_json; do
  result=$(api_post "/api/conversions/points" "$cv_json")
  name=$(echo "$cv_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
  CV_IDS["$name"]="$id"
  echo "  CV Point: $name -> $id"
done < <(python3 -c "
import json
with open('$DIR/conversion-points.json') as f:
  for cp in json.load(f):
    print(json.dumps(cp))
")

# --- 3. Scoring Rules ---
echo ">>> Creating scoring rules..."
while IFS= read -r rule_json; do
  result=$(api_post "/api/scoring-rules" "$rule_json")
  name=$(echo "$rule_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  Scoring Rule: $name"
done < <(python3 -c "
import json
with open('$DIR/scoring-rules.json') as f:
  for r in json.load(f):
    print(json.dumps(r))
")

echo ""
echo "Tag IDs for placeholder replacement:"
for name in "${!TAG_IDS[@]}"; do
  echo "  $name = ${TAG_IDS[$name]}"
done
echo ""
echo "CV Point IDs:"
for name in "${!CV_IDS[@]}"; do
  echo "  $name = ${CV_IDS[$name]}"
done
echo ""
echo "=== Next steps: ==="
echo "1. Replace __PLACEHOLDER__ values in scenarios.json, automations.json, tracked-links.json"
echo "2. Create scenarios via POST /api/scenarios + steps"
echo "3. Create automations via POST /api/automations"
echo "4. Set up incoming webhooks from your EC platform"
echo "5. Create rich menu via POST /api/rich-menus and upload image"
