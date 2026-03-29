import numpy as np
import os
import tempfile
from PIL import Image
from pipeline.detect_scenes import detect_scene_changes

def _make_frame(color: tuple[int, int, int], path: str):
    img = Image.new("RGB", (64, 64), color)
    img.save(path)

def test_detects_scene_change():
    with tempfile.TemporaryDirectory() as tmpdir:
        _make_frame((255, 255, 255), os.path.join(tmpdir, "frame_0001.jpg"))
        _make_frame((250, 250, 250), os.path.join(tmpdir, "frame_0002.jpg"))
        _make_frame((0, 0, 0), os.path.join(tmpdir, "frame_0003.jpg"))
        _make_frame((5, 5, 5), os.path.join(tmpdir, "frame_0004.jpg"))
        frames = sorted([os.path.join(tmpdir, f) for f in os.listdir(tmpdir)])
        changes = detect_scene_changes(frames, fps=4, threshold=15)
        assert len(changes) >= 1
        timestamps = [c["timestamp"] for c in changes]
        assert any(0.4 <= t <= 0.6 for t in timestamps)

def test_no_change_returns_empty():
    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(1, 5):
            _make_frame((128, 128, 128), os.path.join(tmpdir, f"frame_{i:04d}.jpg"))
        frames = sorted([os.path.join(tmpdir, f) for f in os.listdir(tmpdir)])
        changes = detect_scene_changes(frames, fps=4, threshold=15)
        assert len(changes) == 0
