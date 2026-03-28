#!/bin/bash
# add-knowledge.sh - 知識DBにエントリを追加するヘルパー
# 使い方:
#   ./scripts/add-knowledge.sh --category bali_area --subcategory canggu \
#     --title "カフェ名" --content "事実の説明" \
#     --tags "cafe,wifi" --source firsthand --reliability verified
#
# Claude Codeサブエージェントからの利用:
#   cd ig-auto-poster && bash scripts/add-knowledge.sh --category ... --title ... --content ...

set -euo pipefail
cd "$(dirname "$0")/.."

# デフォルト値
CATEGORY=""
SUBCATEGORY="NULL"
TITLE=""
CONTENT=""
TAGS="NULL"
SOURCE="auto"
RELIABILITY="unverified"
REMOTE=false

# 引数パース
while [[ $# -gt 0 ]]; do
  case $1 in
    --category) CATEGORY="$2"; shift 2 ;;
    --subcategory) SUBCATEGORY="'$2'"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --content) CONTENT="$2"; shift 2 ;;
    --tags) TAGS="'$2'"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --reliability) RELIABILITY="$2"; shift 2 ;;
    --remote) REMOTE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# バリデーション
if [[ -z "$CATEGORY" || -z "$TITLE" || -z "$CONTENT" ]]; then
  echo "Error: --category, --title, --content are required"
  exit 1
fi

# SQLエスケープ（シングルクォートを二重化）
TITLE_ESC="${TITLE//\'/\'\'}"
CONTENT_ESC="${CONTENT//\'/\'\'}"

SQL="INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES ('${CATEGORY}', ${SUBCATEGORY}, '${TITLE_ESC}', '${CONTENT_ESC}', ${TAGS}, '${SOURCE}', '${RELIABILITY}');"

if $REMOTE; then
  npx wrangler d1 execute ig-auto-poster-db --command="$SQL"
else
  npx wrangler d1 execute ig-auto-poster-db --local --command="$SQL"
fi

echo "Knowledge entry added: [${CATEGORY}] ${TITLE}"
