from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import requests

from src.collectors.base import BaseCollector, CollectedItem

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def _parse_duration_seconds(iso_duration: str) -> int:
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso_duration)
    if not m:
        return 0
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    seconds = int(m.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _parse_search_response(
    search_data: dict,
    stats_data: dict,
    min_views: int = 100000,
    max_duration_sec: int = 60,
    max_age_hours: int = 48,
) -> list[CollectedItem]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

    stats_map = {}
    for item in stats_data.get("items", []):
        stats_map[item["id"]] = item

    items = []
    for item in search_data.get("items", []):
        video_id = item.get("id", {}).get("videoId", "")
        snippet = item.get("snippet", {})
        title = snippet.get("title", "")
        channel = snippet.get("channelTitle", "")
        published = snippet.get("publishedAt", "")
        description = snippet.get("description", "")[:200]

        try:
            pub_dt = datetime.strptime(published, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            if pub_dt < cutoff:
                continue
        except ValueError:
            continue

        stat = stats_map.get(video_id, {})
        statistics = stat.get("statistics", {})
        views = int(statistics.get("viewCount", 0))
        likes = int(statistics.get("likeCount", 0))
        comments = int(statistics.get("commentCount", 0))

        duration = _parse_duration_seconds(
            stat.get("contentDetails", {}).get("duration", "PT0S")
        )
        if duration > max_duration_sec:
            continue

        if views < min_views:
            continue

        items.append(CollectedItem(
            title=title,
            url=f"https://www.youtube.com/shorts/{video_id}",
            source="youtube",
            body_snippet=description,
            category=channel,
            engagement={"views": views, "likes": likes, "comments": comments},
        ))

    return items


class YoutubeShortsCollector(BaseCollector):
    source_name = "youtube"

    def __init__(self, config: dict):
        self._channels = config.get("channels", [])
        self._min_views = config.get("min_views", 100000)
        self._max_duration = config.get("max_duration_sec", 60)
        self._api_key = config.get("api_key", "")

    def collect(self) -> list[CollectedItem]:
        if not self._api_key:
            print("  [youtube] YOUTUBE_API_KEY not set, skipping")
            return []

        all_items: list[CollectedItem] = []

        for channel_id in self._channels:
            try:
                search_resp = requests.get(_SEARCH_URL, params={
                    "key": self._api_key,
                    "channelId": channel_id,
                    "part": "snippet",
                    "type": "video",
                    "order": "date",
                    "maxResults": 10,
                    "publishedAfter": (datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }, timeout=15)
                search_resp.raise_for_status()
                search_data = search_resp.json()

                video_ids = [
                    item["id"]["videoId"]
                    for item in search_data.get("items", [])
                    if "videoId" in item.get("id", {})
                ]
                if not video_ids:
                    continue

                stats_resp = requests.get(_VIDEOS_URL, params={
                    "key": self._api_key,
                    "id": ",".join(video_ids),
                    "part": "statistics,contentDetails",
                }, timeout=15)
                stats_resp.raise_for_status()

                items = _parse_search_response(
                    search_data, stats_resp.json(),
                    min_views=self._min_views,
                    max_duration_sec=self._max_duration,
                )
                all_items.extend(items)
                print(f"  [youtube] {channel_id}: {len(items)}件")
            except Exception as e:
                print(f"  [youtube] {channel_id}: error - {e}")

        return all_items
