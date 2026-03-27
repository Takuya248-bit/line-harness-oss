from __future__ import annotations

from datetime import datetime, timedelta

import feedparser
import requests

from src.collectors.base import BaseCollector, CollectedItem

_HEADERS = {
    "User-Agent": "trending-topic-collector/1.0 (research bot)",
}


def _parse_reddit_json(
    data: dict,
    min_upvotes: int = 500,
    max_age_hours: int = 48,
) -> list[CollectedItem]:
    items = []
    cutoff = datetime.now().timestamp() - (max_age_hours * 3600)

    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {})
        ups = post.get("ups", 0)
        created = post.get("created_utc", 0)

        if ups < min_upvotes or created < cutoff:
            continue

        title = post.get("title", "")
        selftext = post.get("selftext", "")[:200]
        permalink = post.get("permalink", "")
        url = f"https://www.reddit.com{permalink}" if permalink else post.get("url", "")
        subreddit = post.get("subreddit", "")

        items.append(CollectedItem(
            title=title,
            url=url,
            source="reddit",
            body_snippet=selftext,
            category=f"r/{subreddit}",
            engagement={"upvotes": ups, "comments": post.get("num_comments", 0)},
        ))

    return items


class RedditCollector(BaseCollector):
    source_name = "reddit"

    def __init__(self, config: dict):
        self._subreddits = config.get("subreddits", [])
        self._rss_feeds = config.get("rss_feeds", [])
        self._min_upvotes = config.get("min_upvotes", 500)

    def collect(self) -> list[CollectedItem]:
        all_items: list[CollectedItem] = []

        for sub in self._subreddits:
            url = f"https://www.reddit.com/r/{sub}/hot.json?limit=25"
            try:
                resp = requests.get(url, headers=_HEADERS, timeout=15)
                resp.raise_for_status()
                items = _parse_reddit_json(resp.json(), min_upvotes=self._min_upvotes)
                all_items.extend(items)
                print(f"  [reddit] r/{sub}: {len(items)}件")
            except Exception as e:
                print(f"  [reddit] r/{sub}: error - {e}")

        for feed_url in self._rss_feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:20]:
                    title = entry.get("title", "")
                    link = entry.get("link", "")
                    summary = entry.get("summary", "")[:200]
                    all_items.append(CollectedItem(
                        title=title,
                        url=link,
                        source="reddit",
                        body_snippet=summary,
                        category="海外反応",
                        engagement={"upvotes": 0},
                    ))
                print(f"  [reddit] RSS {feed_url[:40]}: {len(feed.entries[:20])}件")
            except Exception as e:
                print(f"  [reddit] RSS error: {e}")

        return all_items
