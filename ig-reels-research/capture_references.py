#!/usr/bin/env python3
"""
参考動画からスクリーンショットを取得（ログイン不要）

yt-dlp で動画ダウンロード → ffmpeg でフレーム抽出

使い方:
  python3 capture_references.py --file reference_urls.txt
  python3 capture_references.py --type a URL1 URL2 ...

Instagram公開リールはログインなしでDL可能な場合あり。
失敗した場合はスマホでスクショ→AirDropで reference/ に配置。
"""
import subprocess
import sys
import os
import shutil
from pathlib import Path
from typing import Optional, List

from config import REFERENCE_TYPE_A_DIR, REFERENCE_TYPE_B_DIR

VIDEOS_DIR = Path(__file__).parent / "reference" / "_videos"
UNSORTED_DIR = Path(__file__).parent / "reference" / "_unsorted"

# フレーム抽出タイミング（秒）
FRAME_TIMES = [1, 4, 8]


def download_video(url: str, label: str) -> Optional[str]:
    """yt-dlpで動画をダウンロード"""
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(VIDEOS_DIR / f"{label}.mp4")

    cmd = [
        "yt-dlp",
        "--no-check-certificates",
        "-f", "bv*+ba/b/2",
        "--merge-output-format", "mp4",
        "-o", output_path,
        "--no-playlist",
        "--socket-timeout", "30",
        url,
    ]

    print(f"  Downloading...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        # Instagram はクッキーなしだと失敗することがある
        print(f"  DL failed: {result.stderr.strip().split(chr(10))[-1]}")
        return None

    # yt-dlpが拡張子を変えることがあるので探す
    for ext in [".mp4", ".webm", ".mkv"]:
        p = VIDEOS_DIR / f"{label}{ext}"
        if p.exists():
            return str(p)

    # ワイルドカードで探す
    matches = list(VIDEOS_DIR.glob(f"{label}.*"))
    if matches:
        return str(matches[0])

    return None


def extract_frames(video_path: str, label: str, output_dir: Path) -> List[str]:
    """ffmpegで指定秒のフレームを抽出"""
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []

    # まず動画の長さを取得
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True
    )
    duration = float(probe.stdout.strip()) if probe.stdout.strip() else 15.0

    # 動画が短い場合はタイミングを調整
    times = [t for t in FRAME_TIMES if t < duration]
    if not times:
        times = [0.5]
    while len(times) < 3 and times[-1] + 2 < duration:
        times.append(times[-1] + 2)

    for i, t in enumerate(times[:3]):
        out_file = str(output_dir / f"{label}_{i + 1}.png")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            out_file,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and Path(out_file).exists():
            paths.append(out_file)
            print(f"  Frame {i + 1}/3: {label}_{i + 1}.png (t={t}s)")

    return paths


def process_url(url: str, label: str, output_dir: Path) -> List[str]:
    """1つのURLを処理"""
    print(f"\n[{label}] {url}")

    video_path = download_video(url, label)
    if not video_path:
        print(f"  -> SKIP (download failed)")
        return []

    frames = extract_frames(video_path, label, output_dir)
    print(f"  -> {len(frames)} frames extracted")
    return frames


def main():
    args = sys.argv[1:]
    type_ = None
    urls = []

    i = 0
    while i < len(args):
        if args[i] == "--type" and i + 1 < len(args):
            type_ = args[i + 1]
            i += 2
        elif args[i] == "--file" and i + 1 < len(args):
            with open(args[i + 1]) as f:
                urls.extend([line.strip() for line in f
                             if line.strip() and not line.startswith("#")])
            i += 2
        else:
            urls.append(args[i])
            i += 1

    if not urls:
        print(__doc__)
        sys.exit(1)

    if type_ == "a":
        output_dir = REFERENCE_TYPE_A_DIR
    elif type_ == "b":
        output_dir = REFERENCE_TYPE_B_DIR
    else:
        output_dir = UNSORTED_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Output: {output_dir}")
    print(f"URLs: {len(urls)}")

    results = {}
    failed = []
    for idx, url in enumerate(urls):
        label = f"ref_{idx + 1:02d}"
        frames = process_url(url, label, output_dir)
        if frames:
            results[url] = frames
        else:
            failed.append(url)

    print(f"\n=== Complete ===")
    print(f"Success: {len(results)}/{len(urls)}")
    print(f"Frames: {sum(len(v) for v in results.values())}")

    if failed:
        print(f"\nFailed ({len(failed)}):")
        for u in failed:
            print(f"  {u}")
        print(f"\n-> 失敗したURLはスマホでスクショ→AirDropで {output_dir} に配置")

    if not type_:
        print(f"\nNext:")
        print(f"  型A(顔なし/手元系) → mv reference/_unsorted/ref_XX_*.png reference/type_a/")
        print(f"  型B(顔出し/語り)   → mv reference/_unsorted/ref_XX_*.png reference/type_b/")


if __name__ == "__main__":
    main()
