import os
import tempfile
import subprocess
import json

from .extract_frames import extract_frames
from .detect_scenes import detect_scene_changes
from .classify_scenes import classify_scenes
from .select_sfx import select_sfx
from .render_sfx import render_sfx_track, merge_video_sfx


def get_video_duration(video_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", video_path],
        capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def run_pipeline(video_path: str, sfx_dir: str, output_dir: str) -> dict:
    os.makedirs(output_dir, exist_ok=True)
    duration = get_video_duration(video_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        frames_dir = os.path.join(tmpdir, "frames")
        frames = extract_frames(video_path, frames_dir, fps=4, width=128)
        scene_changes = detect_scene_changes(frames, fps=4, threshold=25)
        events = classify_scenes(frames, fps=4)
        timeline = select_sfx(events, sfx_dir)

    sfx_wav = os.path.join(output_dir, "sfx_track.wav")
    render_sfx_track(timeline, duration, sfx_wav)

    output_video = os.path.join(output_dir, "output.mp4")
    merge_video_sfx(video_path, sfx_wav, output_video)

    return {
        "output_video": output_video,
        "sfx_track": sfx_wav,
        "timeline": timeline,
        "events": events,
        "duration": duration,
    }


def rerender(video_path: str, timeline: list[dict], duration: float, output_dir: str) -> dict:
    sfx_wav = os.path.join(output_dir, "sfx_track.wav")
    render_sfx_track(timeline, duration, sfx_wav)
    output_video = os.path.join(output_dir, "output.mp4")
    merge_video_sfx(video_path, sfx_wav, output_video)
    return {"output_video": output_video, "sfx_track": sfx_wav, "timeline": timeline}
