import os
import tempfile
from pipeline.extract_frames import extract_frames

def test_extract_frames_returns_list_of_paths():
    with tempfile.TemporaryDirectory() as tmpdir:
        dummy_video = os.path.join(tmpdir, "test.mp4")
        os.system(
            f'ffmpeg -y -f lavfi -i color=black:s=64x64:d=2 '
            f'-f lavfi -i anullsrc=r=44100 -t 2 -shortest '
            f'{dummy_video} 2>/dev/null'
        )
        frames = extract_frames(dummy_video, tmpdir, fps=2)
        assert len(frames) >= 3
        for f in frames:
            assert os.path.exists(f)
            assert f.endswith(".jpg")
