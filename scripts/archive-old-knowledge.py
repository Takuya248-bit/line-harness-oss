#!/usr/bin/env python3
"""
Notionのeducationカテゴリで古い or 使い古されたエントリをアーカイブする。

条件:
  - use_count >= 5（十分使われた）
  - OR 作成日が30日以上前

Usage:
  python3 scripts/archive-old-knowledge.py

環境変数:
  NOTION_TOKEN          - Notion API key
  NOTION_DB_KNOWLEDGE_ID - 知識DB ID
"""

import os
import sys
import json
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_DB_ID = os.environ.get("NOTION_DB_KNOWLEDGE_ID", "")
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

ARCHIVE_DAYS = 30
ARCHIVE_USE_COUNT = 5


def notion_request(path, method="GET", body=None):
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(f"{NOTION_API}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=15) as res:
            return json.loads(res.read())
    except URLError as e:
        print(f"  Notion API error: {e}", file=sys.stderr)
        return None


def fetch_education_entries():
    """educationカテゴリの全エントリを取得（ページネーション対応）"""
    entries = []
    body = {
        "filter": {"property": "category", "select": {"equals": "education"}},
        "page_size": 100,
    }
    while True:
        result = notion_request(f"/databases/{NOTION_DB_ID}/query", "POST", body)
        if not result:
            break
        entries.extend(result.get("results", []))
        if not result.get("has_more"):
            break
        body["start_cursor"] = result["next_cursor"]
    return entries


def archive_page(page_id):
    result = notion_request(f"/pages/{page_id}", "PATCH", {"archived": True})
    return result is not None


def should_archive(page):
    props = page.get("properties", {})

    # use_count チェック
    use_count_prop = props.get("use_count", {})
    use_count = use_count_prop.get("number") or 0
    if use_count >= ARCHIVE_USE_COUNT:
        return True

    # 作成日チェック
    created_time = page.get("created_time", "")
    if created_time:
        try:
            created_dt = datetime.fromisoformat(created_time.replace("Z", "+00:00"))
            cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS)
            if created_dt < cutoff:
                return True
        except ValueError:
            pass

    return False


def main():
    if not NOTION_TOKEN or not NOTION_DB_ID:
        print("Error: Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID", file=sys.stderr)
        sys.exit(1)

    print(f"[archive-knowledge] Start: {datetime.now().isoformat()}")

    entries = fetch_education_entries()
    print(f"  Fetched {len(entries)} education entries")

    archived = 0
    for page in entries:
        if should_archive(page):
            page_id = page["id"]
            if archive_page(page_id):
                title = ""
                title_prop = page.get("properties", {}).get("title_field", {})
                for t in title_prop.get("title", []):
                    title += t.get("plain_text", "")
                print(f"  Archived: {title[:60]}")
                archived += 1

    print(f"[archive-knowledge] Done: {archived} entries archived")


if __name__ == "__main__":
    main()
