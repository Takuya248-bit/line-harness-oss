from datetime import datetime, timedelta, timezone

from src.collectors.youtube_shorts import YoutubeShortsCollector, _parse_search_response


SAMPLE_RESPONSE = {
    "items": [
        {
            "id": {"videoId": "abc123"},
            "snippet": {
                "title": "海外で恥かいたあるある #shorts",
                "channelTitle": "語りチャンネル",
                "publishedAt": (datetime.now(timezone.utc) - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description": "海外生活で恥ずかしかった...",
            },
        },
        {
            "id": {"videoId": "xyz789"},
            "snippet": {
                "title": "古い動画",
                "channelTitle": "誰か",
                "publishedAt": "2025-01-01T00:00:00Z",
                "description": "古いよ",
            },
        },
    ]
}

SAMPLE_STATS = {
    "items": [
        {
            "id": "abc123",
            "statistics": {"viewCount": "500000", "likeCount": "30000", "commentCount": "1200"},
            "contentDetails": {"duration": "PT45S"},
        },
        {
            "id": "xyz789",
            "statistics": {"viewCount": "200000", "likeCount": "5000", "commentCount": "100"},
            "contentDetails": {"duration": "PT30S"},
        },
    ]
}


def test_parse_filters_by_age_and_views():
    items = _parse_search_response(
        SAMPLE_RESPONSE, SAMPLE_STATS,
        min_views=100000, max_duration_sec=60, max_age_hours=48,
    )
    assert len(items) == 1
    assert items[0].title == "海外で恥かいたあるある #shorts"
    assert items[0].engagement["views"] == 500000


def test_collector_source_name():
    c = YoutubeShortsCollector(config={
        "enabled": True, "channels": [], "min_views": 100000,
        "max_duration_sec": 60,
    })
    assert c.source_name == "youtube"
