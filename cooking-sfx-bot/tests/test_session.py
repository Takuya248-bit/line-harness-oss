import tempfile
import time
from session import SessionManager

def test_save_and_load():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        data = {
            "video_path": "/tmp/test.mp4",
            "timeline": [{"timestamp": 0.0, "sfx": "click.wav", "volume_db": 0}],
            "duration": 30.0,
        }
        mgr.save("user123", data)
        loaded = mgr.load("user123")
        assert loaded is not None
        assert loaded["video_path"] == "/tmp/test.mp4"
        assert len(loaded["timeline"]) == 1

def test_load_nonexistent_returns_none():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        assert mgr.load("nobody") is None

def test_new_session_replaces_old():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = SessionManager(tmpdir)
        mgr.save("user123", {"timeline": [{"timestamp": 1.0}], "duration": 10.0})
        mgr.save("user123", {"timeline": [{"timestamp": 2.0}], "duration": 20.0})
        loaded = mgr.load("user123")
        assert loaded["timeline"][0]["timestamp"] == 2.0
