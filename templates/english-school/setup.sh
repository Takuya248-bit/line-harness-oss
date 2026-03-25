#!/bin/bash
# English School Template Pack - Setup Script
# Usage: API_BASE=https://your.workers.dev API_TOKEN=xxx bash setup.sh

set -euo pipefail

API_BASE="${API_BASE:?Set API_BASE env var}"
API_TOKEN="${API_TOKEN:-}"
AUTH_HEADER=""
if [ -n "$API_TOKEN" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $API_TOKEN\""
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== English School Template Pack ==="
echo "API: $API_BASE"
echo ""

# --- Helper ---
api_post() {
  local path="$1" data="$2"
  eval curl -s -X POST "$API_BASE$path" \
    -H "'Content-Type: application/json'" \
    $AUTH_HEADER \
    -d "'$data'"
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

# --- 4. Scenarios ---
echo ">>> Creating scenarios..."
echo "  NOTE: Replace __TAG_ID_xxx__ and __PLACEHOLDER__ values in scenarios.json before running."
echo "  Tag IDs created above:"
for name in "${!TAG_IDS[@]}"; do
  echo "    $name = ${TAG_IDS[$name]}"
done

# --- 5. Rich Menu ---
echo ">>> Rich menu template ready at $DIR/rich-menu.json"
echo "  POST to /api/rich-menus after replacing __PLACEHOLDER__ values"
echo "  Then upload a 2500x1686 image via POST /api/rich-menus/{id}/image"

echo ""
echo "=== Setup complete. Review output for tag IDs and replace placeholders. ==="
