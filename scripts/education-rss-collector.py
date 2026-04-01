#!/usr/bin/env python3
"""
留学・英語学習系RSSフィード → Notion知識DB自動投入

Usage:
  python3 scripts/education-rss-collector.py

環境変数:
  NOTION_TOKEN          - Notion API key
  NOTION_DB_KNOWLEDGE_ID - 知識DB ID

cronで週2-3回実行を想定。重複チェック済み。
"""

import os
import re
import sys
import json
import hashlib
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError

import feedparser

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_DB_ID = os.environ.get("NOTION_DB_KNOWLEDGE_ID", "")
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "")
DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"
_JAPANESE_RE = re.compile(r"[぀-ゟ゠-ヿ一-鿿]")

# 直近N日以内の記事のみ取り込む
MAX_AGE_DAYS = 7

# 1回の実行で投入する最大件数
MAX_ENTRIES = 10

# 関連性スコアの最低値（0はスキップ）
MIN_RELEVANCE_SCORE = 1

# キーワードスコアリング
RELEVANCE_KEYWORDS = {
    # 高スコア (+2)
    "留学": 2, "英語": 2, "english": 2, "study abroad": 2,
    "language school": 2, "toeic": 2, "ielts": 2,
    "語学学校": 2, "英会話": 2, "ビザ": 2, "visa": 2,
    # 中スコア (+1)
    "バリ": 1, "bali": 1, "生活": 1, "費用": 1, "cost": 1,
    "学習": 1, "learning": 1, "海外": 1, "travel": 1,
    "文化": 1, "culture": 1, "サーフィン": 1, "yoga": 1,
    "ヨガ": 1, "nomad": 1, "ノマド": 1, "コワーキング": 1, "coworking": 1,
}

# RSSフィード一覧（2026-04確認済み）
FEEDS = [
    # 留学系
    {
        "url": "https://ceburyugaku.jp/feed/",
        "subcategory": "study_abroad",
        "tags": ["留学", "セブ島", "フィリピン留学"],
    },
    {
        "url": "https://ryugaku-real.com/feed/",
        "subcategory": "study_abroad",
        "tags": ["留学", "体験談", "比較"],
    },
    # 英語学習系
    {
        "url": "https://eikaiwa.dmm.com/blog/feed/",
        "subcategory": "english_learning",
        "tags": ["英語", "英会話", "学習法"],
    },
    {
        "url": "https://www.rarejob.com/englishlab/feed/",
        "subcategory": "english_learning",
        "tags": ["英語", "オンライン英会話", "学習法"],
    },
    {
        "url": "https://eigo-box.jp/feed/",
        "subcategory": "english_learning",
        "tags": ["英語", "英文法", "学習法"],
    },
    {
        "url": "https://nativecamp.net/blog/feed",
        "subcategory": "english_learning",
        "tags": ["英語", "オンライン英会話", "フレーズ"],
    },
    {
        "url": "https://progrit.co.jp/media/feed/",
        "subcategory": "english_learning",
        "tags": ["英語", "TOEIC", "英語コーチング"],
    },
    {
        "url": "https://getnavi.jp/tag/english/feed/",
        "subcategory": "english_learning",
        "tags": ["英語", "学習アプリ", "トレンド"],
    },
    # バリ島情報
    {
        "url": "https://nowbali.co.id/feed/",
        "subcategory": "bali_life",
        "tags": ["バリ", "生活情報", "観光"],
    },
    {
        "url": "https://thebeatbali.com/feed/",
        "subcategory": "bali_life",
        "tags": ["バリ", "ニュース", "カルチャー"],
    },
    {
        "url": "https://balidiscovery.com/feed/",
        "subcategory": "bali_life",
        "tags": ["バリ", "ニュース", "規制"],
    },
    {
        "url": "https://www.balipedia.com/feed/",
        "subcategory": "bali_life",
        "tags": ["バリ", "ガイド", "生活情報"],
    },
]

# ---------------------------------------------------------------------------
# Notion API
# ---------------------------------------------------------------------------

def notion_request(path, method="GET", body=None):
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(f"{NOTION_API}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req) as res:
            return json.loads(res.read())
    except URLError as e:
        print(f"  Notion API error: {e}", file=sys.stderr)
        return None


def get_existing_titles():
    """直近の既存タイトルを取得（重複チェック用）"""
    body = {
        "filter": {"property": "category", "select": {"equals": "education"}},
        "sorts": [{"timestamp": "created_time", "direction": "descending"}],
        "page_size": 100,
    }
    result = notion_request(f"/databases/{NOTION_DB_ID}/query", "POST", body)
    if not result:
        return set()
    titles = set()
    for page in result.get("results", []):
        title_prop = page.get("properties", {}).get("title_field", {})
        for t in title_prop.get("title", []):
            titles.add(t.get("plain_text", ""))
    return titles


def add_knowledge(title, content, subcategory, tags, source_url):
    body = {
        "parent": {"database_id": NOTION_DB_ID},
        "properties": {
            "title_field": {"title": [{"text": {"content": title[:100]}}]},
            "category": {"select": {"name": "education"}},
            "subcategory": {"rich_text": [{"text": {"content": subcategory}}]},
            "content": {"rich_text": [{"text": {"content": content[:2000]}}]},
            "tags": {"multi_select": [{"name": t} for t in tags[:5]]},
            "source": {"select": {"name": "research"}},
            "reliability": {"select": {"name": "unverified"}},
        },
    }
    result = notion_request("/pages", "POST", body)
    return result is not None


# ---------------------------------------------------------------------------
# RSS取得・パース
# ---------------------------------------------------------------------------

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def fetch_feed(feed_config):
    url = feed_config["url"]
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        raw = urlopen(req, timeout=15).read()
        parsed = feedparser.parse(raw)
        if parsed.bozo and not parsed.entries:
            print(f"  [WARN] Feed parse error: {url}", file=sys.stderr)
            return []
        return parsed.entries
    except Exception as e:
        print(f"  [ERROR] Feed fetch failed: {url} - {e}", file=sys.stderr)
        return []


def entry_date(entry):
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            from time import mktime
            return datetime.fromtimestamp(mktime(t), tz=timezone.utc)
    return None


def entry_summary(entry):
    summary = entry.get("summary", "") or entry.get("description", "")
    # 見出し抽出 (<h2>, <h3>)
    headings = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", summary, re.IGNORECASE | re.DOTALL)
    headings = [re.sub(r"<[^>]+>", "", h).strip() for h in headings]
    headings = [h for h in headings if h]
    # 最初の <p> タグの中身を取得
    p_match = re.search(r"<p[^>]*>(.*?)</p>", summary, re.IGNORECASE | re.DOTALL)
    p_text = ""
    if p_match:
        p_text = re.sub(r"<[^>]+>", "", p_match.group(1))
        p_text = re.sub(r"\s+", " ", p_text).strip()
    if headings:
        heading_str = " / ".join(headings)
        return f"要点: {heading_str}\n{p_text[:200]}"
    # 見出しなし: 従来通り先頭500文字
    text = re.sub(r"<[^>]+>", "", summary)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def translate_title(title: str) -> str:
    """DeepL Free APIで英語タイトルを日本語に翻訳する。
    - DEEPL_API_KEYが未設定なら原文を返す
    - 日本語が含まれる場合はそのまま返す
    - エラー時は原文にフォールバック
    """
    if not DEEPL_API_KEY:
        return title
    if _JAPANESE_RE.search(title):
        return title
    try:
        body = json.dumps({
            "text": [title],
            "target_lang": "JA",
        }).encode()
        req = Request(
            DEEPL_API_URL,
            data=body,
            headers={
                "Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=10) as res:
            result = json.loads(res.read())
            return result["translations"][0]["text"]
    except Exception as e:
        print(f"  [WARN] DeepL translate failed: {e}", file=sys.stderr)
        return title


def relevance_score(title, summary):
    """タイトル+要約のキーワードマッチでスコアを計算する"""
    text = (title + " " + summary).lower()
    score = 0
    for keyword, points in RELEVANCE_KEYWORDS.items():
        if keyword.lower() in text:
            score += points
    return score


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main():
    if not NOTION_TOKEN or not NOTION_DB_ID:
        print("Error: Set NOTION_TOKEN and NOTION_DB_KNOWLEDGE_ID", file=sys.stderr)
        sys.exit(1)

    print(f"[education-rss] Start: {datetime.now().isoformat()}")

    existing = get_existing_titles()
    print(f"  Existing entries: {len(existing)}")

    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    added = 0

    for feed_config in FEEDS:
        if added >= MAX_ENTRIES:
            break

        print(f"  Fetching: {feed_config['url']}")
        entries = fetch_feed(feed_config)

        for entry in entries:
            if added >= MAX_ENTRIES:
                break

            title = entry.get("title", "").strip()
            if not title or title in existing:
                continue

            pub_date = entry_date(entry)
            if pub_date and pub_date < cutoff:
                continue

            summary = entry_summary(entry)
            title = translate_title(title)
            score = relevance_score(title, summary)
            if score < MIN_RELEVANCE_SCORE:
                print(f"    [SKIP] low relevance: {title[:60]}")
                continue
            link = entry.get("link", "")
            content = f"{summary}\n\nSource: {link}" if link else summary

            if add_knowledge(title, content, feed_config["subcategory"], feed_config["tags"], link):
                print(f"    + {title[:60]}")
                existing.add(title)
                added += 1

    print(f"[education-rss] Done: {added} entries added")


if __name__ == "__main__":
    main()
