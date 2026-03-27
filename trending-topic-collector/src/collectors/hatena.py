from __future__ import annotations

import feedparser
import requests

from src.collectors.base import BaseCollector, CollectedItem

_ANOND_HOTENTRY_RSS = "https://b.hatena.ne.jp/entrylist/anond.hatelabo.jp?mode=rss&sort=hot"


def _parse_hotentry_rss(rss_text: str, min_bookmarks: int = 100) -> list[CollectedItem]:
    feed = feedparser.parse(rss_text)
    items = []

    for entry in feed.entries:
        title = entry.get("title", "")
        link = entry.get("link", "")
        summary = entry.get("summary", entry.get("description", ""))[:200]

        bookmarks = 0
        bk = entry.get("hatena_bookmarkcount", "0")
        try:
            bookmarks = int(bk)
        except (ValueError, TypeError):
            pass

        if bookmarks < min_bookmarks:
            continue

        items.append(CollectedItem(
            title=title,
            url=link,
            source="hatena",
            body_snippet=summary,
            category="匿名ダイアリー",
            engagement={"bookmarks": bookmarks},
        ))

    return items


class HatenaCollector(BaseCollector):
    source_name = "hatena"

    def __init__(self, config: dict):
        self._min_bookmarks = config.get("min_bookmarks", 100)

    def collect(self) -> list[CollectedItem]:
        try:
            resp = requests.get(_ANOND_HOTENTRY_RSS, timeout=15)
            resp.raise_for_status()
            items = _parse_hotentry_rss(resp.text, min_bookmarks=self._min_bookmarks)
            print(f"  [hatena] 匿名ダイアリー: {len(items)}件")
            return items
        except Exception as e:
            print(f"  [hatena] error: {e}")
            return []
