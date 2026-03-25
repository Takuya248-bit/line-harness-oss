#!/bin/bash
# Beauty Salon Template Pack - Setup Script
# Usage: API_BASE=https://your.workers.dev API_TOKEN=xxx bash setup.sh

set -euo pipefail

API_BASE="${API_BASE:?Set API_BASE env var}"
API_TOKEN="${API_TOKEN:?Set API_TOKEN env var}"

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Beauty Salon Template Pack ==="
echo "API: $API_BASE"
echo ""

api_post() {
  local path="$1" data="$2"
  curl -s -X POST "$API_BASE$path" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "$data"
}

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
echo "=== Next: Replace __PLACEHOLDER__ values in scenarios.json, automations.json, then create via API ==="
