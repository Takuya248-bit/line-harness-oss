import tempfile
from datetime import datetime
from pathlib import Path
from src.collectors.base import VideoItem
from src.analyzer.text_judge import TextJudgment
from src.analyzer.visual_judge import VisualJudgment
from src.output.obsidian import write_video_note

def test_write_note_creates_file():
    item = VideoItem(url="https://instagram.com/reel/abc", source="ig_reels",
                     caption="テスト動画キャプション", likes=50000, views=1000000,
                     collected_at=datetime(2026, 3, 28))
    text_j = TextJudgment(tier=1, summary="テスト要約", comment_trigger=20, emotion=15,
                          brevity=18, freshness=10, sakurako_angle=7)
    visual_j = VisualJudgment(format="テロップ主体", telop_amount="多い", mood="エンタメ")
    with tempfile.TemporaryDirectory() as d:
        path = write_video_note(item, text_j, visual_j, output_dir=d)
        assert Path(path).exists()
        content = Path(path).read_text()
        assert "テスト要約" in content
        assert "テロップ主体" in content
        assert "ig_reels" in content
        assert "tier: 1" in content

def test_write_note_without_visual():
    item = VideoItem(url="https://example.com", source="yt_shorts", caption="test")
    text_j = TextJudgment(tier=2, summary="YTテスト", comment_trigger=10, emotion=10,
                          brevity=10, freshness=10, sakurako_angle=5)
    with tempfile.TemporaryDirectory() as d:
        path = write_video_note(item, text_j, visual_judgment=None, output_dir=d)
        assert Path(path).exists()
