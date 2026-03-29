import os
import tempfile
from pipeline.select_sfx import select_sfx, EVENT_TO_CATEGORY

def _setup_sfx(tmpdir: str):
    for cat in ["cutting", "mixing", "pouring", "misc", "intro", "reaction_happy"]:
        cat_dir = os.path.join(tmpdir, cat)
        os.makedirs(cat_dir, exist_ok=True)
        for i in range(2):
            open(os.path.join(cat_dir, f"test_{i}.wav"), "w").close()
    return tmpdir

def test_basic_selection():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.9},
            {"start": 2.0, "end": 5.0, "event": "cutting", "confidence": 0.95},
            {"start": 5.0, "end": 10.0, "event": "pouring", "confidence": 0.8},
        ]
        timeline = select_sfx(events, sfx_dir)
        assert len(timeline) >= 3
        assert timeline[0]["timestamp"] == 0.0

def test_skips_low_confidence():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 2.0, "event": "intro", "confidence": 0.9},
            {"start": 2.0, "end": 5.0, "event": "cutting", "confidence": 0.3},
        ]
        timeline = select_sfx(events, sfx_dir)
        cutting_entries = [t for t in timeline if "cutting" in t.get("sfx", "")]
        assert len(cutting_entries) == 0

def test_minimum_interval():
    with tempfile.TemporaryDirectory() as tmpdir:
        sfx_dir = _setup_sfx(tmpdir)
        events = [
            {"start": 0.0, "end": 0.5, "event": "intro", "confidence": 0.9},
            {"start": 0.5, "end": 1.0, "event": "cutting", "confidence": 0.9},
            {"start": 1.0, "end": 1.5, "event": "pouring", "confidence": 0.9},
        ]
        timeline = select_sfx(events, sfx_dir)
        for i in range(1, len(timeline)):
            gap = timeline[i]["timestamp"] - timeline[i - 1]["timestamp"]
            assert gap >= 1.0, f"Gap {gap} < 1.0 at index {i}"
