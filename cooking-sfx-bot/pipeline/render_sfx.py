import subprocess
import os

def render_sfx_track(timeline: list[dict], video_duration: float, output_wav: str) -> str:
    silence = output_wav + ".silence.wav"
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(video_duration), "-acodec", "pcm_s16le", silence,
    ], capture_output=True, check=True)

    inputs = ["-i", silence]
    filter_lines = []
    valid = []

    for i, entry in enumerate(timeline):
        sfx_path = entry["sfx"]
        if not os.path.exists(sfx_path):
            continue
        idx = len(inputs) // 2
        inputs.extend(["-i", sfx_path])
        valid.append((idx, entry["timestamp"], entry["volume_db"], i))

    if not valid:
        os.rename(silence, output_wav)
        return output_wav

    for idx, ts, vol, i in valid:
        delay_ms = int(ts * 1000)
        filter_lines.append(
            f"[{idx}:a]volume={vol}dB,"
            f"adelay={delay_ms}|{delay_ms},"
            f"apad=whole_dur={video_duration}[se{i}]"
        )

    prev = "[0:a]"
    for j, (_, _, _, i) in enumerate(valid):
        out = f"[mix{j}]" if j < len(valid) - 1 else "[out]"
        filter_lines.append(
            f"{prev}[se{i}]amix=inputs=2:duration=first:normalize=0{out}"
        )
        prev = f"[mix{j}]"

    subprocess.run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filter_lines),
        "-map", "[out]", "-acodec", "pcm_s16le", "-ar", "44100", output_wav,
    ], capture_output=True, check=True)

    os.remove(silence)
    return output_wav

def merge_video_sfx(video_path: str, sfx_wav: str, output_mp4: str, sfx_volume_db: int = 12) -> str:
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path, "-i", sfx_wav,
        "-filter_complex",
        f"[1:a]volume={sfx_volume_db}dB[se];"
        f"[0:a][se]amix=inputs=2:duration=first:normalize=0[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", output_mp4,
    ], capture_output=True, check=True)
    return output_mp4
