from datetime import datetime
from src.collectors.base import VideoItem

def test_video_item_defaults():
    item = VideoItem(
        url="https://instagram.com/reel/abc123",
        source="ig_reels",
        caption="テスト動画",
    )
    assert item.url == "https://instagram.com/reel/abc123"
    assert item.source == "ig_reels"
    assert item.caption == "テスト動画"
    assert item.likes == 0
    assert item.views == 0
    assert item.comments == 0
    assert item.screenshot_path == ""
    assert item.posted_at is None
    assert isinstance(item.collected_at, datetime)

def test_video_item_with_all_fields():
    now = datetime(2026, 3, 28, 12, 0)
    item = VideoItem(
        url="https://youtube.com/shorts/xyz",
        source="yt_shorts",
        caption="YT動画",
        likes=50000,
        views=1000000,
        comments=300,
        screenshot_path="/tmp/ss.png",
        posted_at=now,
        collected_at=now,
    )
    assert item.likes == 50000
    assert item.views == 1000000
    assert item.posted_at == now
