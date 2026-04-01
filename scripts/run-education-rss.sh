#!/bin/bash
set -euo pipefail
source "$HOME/.env.notion" 2>/dev/null || true
export NOTION_TOKEN="${NOTION_TOKEN:?}"
export NOTION_DB_KNOWLEDGE_ID="${NOTION_DB_KNOWLEDGE_ID:?}"
/usr/bin/python3 /Users/kimuratakuya/line-harness/scripts/education-rss-collector.py
