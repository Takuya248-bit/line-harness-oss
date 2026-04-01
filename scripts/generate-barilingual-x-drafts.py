#!/usr/bin/env python3
"""
バリリンガル X投稿ドラフト自動生成スクリプト

Notion知識DB(education カテゴリ)から一次情報を取得し、
Claude Haikuで投稿案を生成して別テーブル(x_drafts)に書き込む。

Usage:
  python3 scripts/generate-barilingual-x-drafts.py

環境変数:
  NOTION_TOKEN            - Notion API key
  NOTION_DB_KNOWLEDGE_ID  - 読み取り元知識DB ID
  NOTION_DB_X_DRAFTS_ID   - 書き込み先X drafts DB ID
  ANTHROPIC_API_KEY       - Claude API key
"""

import os
import sys
import json
import time
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_DB_KNOWLEDGE_ID = os.environ.get("NOTION_DB_KNOWLEDGE_ID", "")
NOTION_DB_X_DRAFTS_ID = os.environ.get("NOTION_DB_X_DRAFTS_ID", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

FETCH_COUNT = 5       # 知識DBから取得する件数
DRAFT_COUNT = 3       # 生成するドラフト数
MODEL = "claude-3-5-haiku-latest"

PERSONA_PROMPT = """あなたはバリ島にある語学学校「バリリンガル」の公式Xアカウント担当者です。

投稿ルール:
- 20-30代、留学検討中・英語学習に興味がある人に向けて書く
- 親しみやすく、実体験ベースのトーン。留学を身近に感じさせる
- 絵文字を自然に2〜4個使う
- 句点（。）で終わらせない
- 140文字以内
- ハッシュタグなし、リンクなし
- テンプレ感・広告感を排除。具体的な数字や体験を盛り込む

以下のナレッジ情報をもとに、X投稿文を1件だけ生成してください。
投稿文のみ出力し、説明や前置きは一切不要です。"""


# ---------------------------------------------------------------------------
# Notionヘルパー
# ---------------------------------------------------------------------------

def notion_request(method: str, path: str, body: dict | None = None) -> dict:
    """Notion API リクエスト共通処理"""
    url = f"{NOTION_API}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {NOTION_TOKEN}")
    req.add_header("Notion-Version", NOTION_VERSION)
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_education_entries(limit: int = 5) -> list[dict]:
    """educationカテゴリをuse_count昇順で取得"""
    body = {
        "filter": {
            "property": "category",
            "select": {"equals": "education"}
        },
        "sorts": [{"property": "use_count", "direction": "ascending"}],
        "page_size": limit,
    }
    result = notion_request("POST", f"/databases/{NOTION_DB_KNOWLEDGE_ID}/query", body)
    return result.get("results", [])


def extract_text(prop: dict) -> str:
    """Notionプロパティからテキストを抽出"""
    ptype = prop.get("type", "")
    if ptype == "title":
        parts = prop.get("title", [])
    elif ptype == "rich_text":
        parts = prop.get("rich_text", [])
    else:
        return ""
    return "".join(p.get("plain_text", "") for p in parts)


def get_use_count(prop: dict) -> int:
    """use_count数値プロパティを取得"""
    if not prop:
        return 0
    ptype = prop.get("type", "")
    if ptype == "number":
        return prop.get("number") or 0
    return 0


def increment_use_count(page_id: str, current: int) -> None:
    """use_countをインクリメント"""
    notion_request("PATCH", f"/pages/{page_id}", {
        "properties": {
            "use_count": {"number": current + 1}
        }
    })


def create_x_draft(text: str, source_id: str) -> dict:
    """x_draftsテーブルにドラフトを作成"""
    body = {
        "parent": {"database_id": NOTION_DB_X_DRAFTS_ID},
        "properties": {
            "title": {
                "title": [{"text": {"content": text}}]
            },
            "status": {
                "select": {"name": "draft"}
            },
            "source_entry_id": {
                "rich_text": [{"text": {"content": source_id}}]
            },
            "account": {
                "select": {"name": "barilingual"}
            },
        }
    }
    return notion_request("POST", "/pages", body)


# ---------------------------------------------------------------------------
# Claude Haiku
# ---------------------------------------------------------------------------

def generate_draft(entry_text: str, retry: int = 1) -> str | None:
    """Claude Haikuで投稿ドラフトを生成。失敗時1回リトライ"""
    prompt = f"{PERSONA_PROMPT}\n\n---\nナレッジ情報:\n{entry_text}\n---"
    body = {
        "model": MODEL,
        "max_tokens": 300,
        "messages": [{"role": "user", "content": prompt}]
    }
    data = json.dumps(body).encode("utf-8")
    req = Request(ANTHROPIC_API, data=data, method="POST")
    req.add_header("x-api-key", ANTHROPIC_API_KEY)
    req.add_header("anthropic-version", "2023-06-01")
    req.add_header("Content-Type", "application/json")

    for attempt in range(retry + 1):
        try:
            with urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result["content"][0]["text"].strip()
        except HTTPError as e:
            if attempt < retry:
                print(f"  AI API error {e.code}, retrying in 10s...")
                time.sleep(10)
            else:
                print(f"  AI API failed after {retry + 1} attempts: {e.code}")
                return None
        except (URLError, KeyError) as e:
            if attempt < retry:
                print(f"  AI API error {e}, retrying in 10s...")
                time.sleep(10)
            else:
                print(f"  AI API failed: {e}")
                return None
    return None


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main() -> None:
    # 環境変数チェック
    missing = []
    if not NOTION_TOKEN:
        missing.append("NOTION_TOKEN")
    if not NOTION_DB_KNOWLEDGE_ID:
        missing.append("NOTION_DB_KNOWLEDGE_ID")
    if not NOTION_DB_X_DRAFTS_ID:
        print("Error: Set NOTION_DB_X_DRAFTS_ID", file=sys.stderr)
        sys.exit(1)
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        print(f"Error: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching {FETCH_COUNT} education entries from Notion...")
    entries = fetch_education_entries(FETCH_COUNT)
    if not entries:
        print("No education entries found.")
        sys.exit(0)

    print(f"Found {len(entries)} entries. Generating {DRAFT_COUNT} drafts...")
    generated = 0

    for entry in entries:
        if generated >= DRAFT_COUNT:
            break

        page_id = entry["id"]
        props = entry.get("properties", {})

        title = extract_text(props.get("title") or props.get("name") or props.get("Title") or {})
        content = extract_text(props.get("content") or props.get("summary") or {})
        use_count = get_use_count(props.get("use_count") or {})

        entry_text = f"タイトル: {title}\n内容: {content}" if content else f"タイトル: {title}"

        print(f"  [{generated + 1}/{DRAFT_COUNT}] Generating from: {title[:40]}...")
        draft_text = generate_draft(entry_text)

        if not draft_text:
            print("  Skipped (generation failed).")
            continue

        # 140文字チェック
        if len(draft_text) > 140:
            draft_text = draft_text[:140]

        print(f"  Draft: {draft_text[:60]}...")
        create_x_draft(draft_text, page_id)
        increment_use_count(page_id, use_count)
        generated += 1

    print(f"\nDone. {generated}/{DRAFT_COUNT} drafts created in Notion x_drafts DB.")


if __name__ == "__main__":
    main()
