from __future__ import annotations
import os
import re
from datetime import datetime
from typing import Optional
from src.collectors.base import BaseCollector, VideoItem

class YTShortsCollector(BaseCollector):
    source_name = "yt_shorts"

    def __init__(self, config: dict):
        self._api_key = config.get("api_key") or os.environ.get("YOUTUBE_API_KEY", "")
        self._channels = config.get("channels", [])
        self._keywords = config.get("keywords", [])
        self._max_results = config.get("max_results", 50)

    def collect(self) -> list[VideoItem]:
        if not self._api_key:
            print("  YOUTUBE_API_KEY未設定、スキップ")
            return []
        from googleapiclient.discovery import build
        yt = build("youtube", "v3", developerKey=self._api_key)
        video_ids = []
        for kw in self._keywords:
            print(f"  search: {kw}")
            try:
                resp = yt.search().list(
                    q=kw, type="video", videoDuration="short", order="viewCount",
                    maxResults=min(self._max_results, 50), part="id",
                    relevanceLanguage="ja", regionCode="JP",
                ).execute()
                for item in resp.get("items", []):
                    vid = item["id"].get("videoId")
                    if vid:
                        video_ids.append(vid)
            except Exception as e:
                print(f"    error: {e}")
        for ch_id in self._channels:
            print(f"  channel: {ch_id}")
            try:
                resp = yt.search().list(
                    channelId=ch_id, type="video", videoDuration="short", order="viewCount",
                    maxResults=min(self._max_results, 50), part="id",
                ).execute()
                for item in resp.get("items", []):
                    vid = item["id"].get("videoId")
                    if vid:
                        video_ids.append(vid)
            except Exception as e:
                print(f"    error: {e}")
        video_ids = list(dict.fromkeys(video_ids))
        print(f"  動画ID: {len(video_ids)}件")
        if not video_ids:
            return []
        items = []
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i+50]
            try:
                resp = yt.videos().list(id=",".join(batch), part="snippet,statistics,contentDetails").execute()
                for v in resp.get("items", []):
                    item = self._to_video_item(v)
                    if item:
                        items.append(item)
            except Exception as e:
                print(f"    detail error: {e}")
        print(f"  取得完了: {len(items)}件")
        return items

    def _to_video_item(self, v: dict) -> Optional[VideoItem]:
        snippet = v.get("snippet", {})
        stats = v.get("statistics", {})
        vid = v.get("id", "")
        duration = v.get("contentDetails", {}).get("duration", "")
        if "H" in duration:
            return None
        m = re.search(r"PT(?:(\d+)M)?(?:(\d+)S)?", duration)
        if m:
            minutes = int(m.group(1) or 0)
            if minutes > 1:
                return None
        else:
            return None
        posted = None
        pub = snippet.get("publishedAt", "")
        if pub:
            try:
                posted = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            except ValueError:
                pass
        return VideoItem(
            url=f"https://youtube.com/shorts/{vid}",
            source="yt_shorts",
            caption=snippet.get("title", ""),
            likes=int(stats.get("likeCount", 0)),
            views=int(stats.get("viewCount", 0)),
            comments=int(stats.get("commentCount", 0)),
            screenshot_path="",
            posted_at=posted,
        )
