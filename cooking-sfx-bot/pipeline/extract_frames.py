import subprocess
import os
import glob

def extract_frames(video_path: str, output_dir: str, fps: int = 4, width: int = 128) -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    pattern = os.path.join(output_dir, "frame_%04d.jpg")
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vf", f"fps={fps},scale={width}:-1",
        "-q:v", "5", pattern,
    ], capture_output=True, check=True)
    frames = sorted(glob.glob(os.path.join(output_dir, "frame_*.jpg")))
    return frames
