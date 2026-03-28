import tempfile
from pathlib import Path
from src.dedup import DedupDB

def test_dedup_new_url():
    with tempfile.TemporaryDirectory() as d:
        db = DedupDB(Path(d) / "test.db")
        assert db.is_seen("https://example.com/1") is False
        db.mark_seen("https://example.com/1", "title1", "ig_reels")
        assert db.is_seen("https://example.com/1") is True
        assert db.is_seen("https://example.com/2") is False
        db.close()

def test_dedup_cleanup():
    with tempfile.TemporaryDirectory() as d:
        db = DedupDB(Path(d) / "test.db")
        db.mark_seen("https://example.com/old", "old", "ig_reels")
        cleaned = db.cleanup(max_age_days=0)
        assert cleaned == 1
        assert db.is_seen("https://example.com/old") is False
        db.close()
