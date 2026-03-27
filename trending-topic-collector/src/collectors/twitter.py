"""
X/Twitter コレクター
現状: API無料プランの制約のため、enabled=false がデフォルト。
パーサーは実装済み。外部ツールでデータ取得→_parse_search_results() に渡す運用も可能。
"""
from __future__ import annotations

from src.collectors.base import BaseCollector, CollectedItem


def _parse_search_results(
    results: list[dict],
    min_faves: int = 5000,
) -> list[CollectedItem]:
    items = []

    for r in results:
        faves = r.get("faves", 0)
        if faves < min_faves:
            continue

        text = r.get("text", "")
        title = text[:60] + ("..." if len(text) > 60 else "")

        items.append(CollectedItem(
            title=title,
            url=r.get("url", ""),
            source="twitter",
            body_snippet=text[:200],
            engagement={
                "faves": faves,
                "retweets": r.get("retweets", 0),
                "replies": r.get("replies", 0),
            },
        ))

    return items


class TwitterCollector(BaseCollector):
    source_name = "twitter"

    def __init__(self, config: dict):
        self._enabled = config.get("enabled", False)
        self._queries = config.get("queries", [])
        self._min_faves = config.get("min_faves", 5000)

    def collect(self) -> list[CollectedItem]:
        if not self._enabled:
            print("  [twitter] disabled in config, skipping")
            return []

        print("  [twitter] no collection method configured yet")
        return []
