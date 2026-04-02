"""yt-dlp + ffmpegベースのリール収集（ログイン不要）"""
import subprocess
import json
import os
import time
from pathlib import Path
from typing import Optional, List, Dict
from config import SCREENSHOTS_DIR

VIDEOS_DIR = Path(__file__).parent / "downloads"
FRAME_TIMES = [1, 4, 8]


def fetch_reel_urls_from_account(username: str, max_count: int = 30) -> List[Dict]:
    """アカウントのリール一覧をyt-dlpで取得（メタデータのみ）"""
    url = f"https://www.instagram.com/{username}/reels/"
    return _fetch_entries(url, max_count)


def fetch_reel_urls_from_hashtag(tag: str, max_count: int = 30) -> List[Dict]:
    """ハッシュタグのリール一覧を取得"""
    url = f"https://www.instagram.com/explore/tags/{tag}/"
    return _fetch_entries(url, max_count)


def fetch_reel_urls_from_channel(channel_url: str, max_count: int = 30) -> List[Dict]:
    """YouTube チャンネル/TikTokアカウントなど汎用"""
    return _fetch_entries(channel_url, max_count)


def _fetch_entries(url: str, max_count: int) -> List[Dict]:
    """yt-dlpでURL一覧とメタデータを取得"""
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--no-check-certificates",
        "--dump-json",
        "--playlist-end", str(max_count),
        "--socket-timeout", "30",
        url,
    ]
    print(f"Fetching entries from: {url}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

    entries = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            entries.append({
                "url": data.get("url") or data.get("webpage_url") or data.get("original_url", ""),
                "id": data.get("id", ""),
                "title": data.get("title", ""),
                "uploader": data.get("uploader") or data.get("channel", ""),
                "view_count": data.get("view_count"),
                "like_count": data.get("like_count"),
                "comment_count": data.get("comment_count"),
                "duration": data.get("duration"),
            })
        except json.JSONDecodeError:
            continue

    print(f"  Found {len(entries)} entries")
    return entries


def download_and_extract(url: str, label: str) -> Optional[Dict]:
    """動画をDL→フレーム抽出→メタデータ返却"""
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    video_path = _download_video(url, label)
    if not video_path:
        return None

    frames = _extract_frames(video_path, label)
    meta = _get_metadata(url)

    return {
        "url": url,
        "username": meta.get("uploader"),
        "screenshots": frames,
        "likes": _format_count(meta.get("like_count")),
        "comments": _format_count(meta.get("comment_count")),
        "video_path": video_path,
    }


def download_and_extract_batch(entries: List[Dict], skip_existing_fn=None) -> List[Dict]:
    """複数エントリを一括処理"""
    results = []

    for i, entry in enumerate(entries):
        url = entry.get("url", "")
        if not url:
            continue

        # Instagram短縮IDの展開
        if not url.startswith("http"):
            url = f"https://www.instagram.com/reel/{url}/"

        print(f"\n--- [{i + 1}/{len(entries)}] ---")
        print(f"  URL: {url}")

        if skip_existing_fn and skip_existing_fn(url):
            print("  -> Already exists, skip")
            continue

        label = f"reel_{int(time.time())}_{i:03d}"
        result = download_and_extract(url, label)

        if result:
            # yt-dlpのメタデータがあれば上書き
            if entry.get("like_count") is not None:
                result["likes"] = _format_count(entry["like_count"])
            if entry.get("comment_count") is not None:
                result["comments"] = _format_count(entry["comment_count"])
            if entry.get("uploader"):
                result["username"] = entry["uploader"]

            results.append(result)
            print(f"  -> OK ({len(result['screenshots'])} frames)")
        else:
            print(f"  -> FAILED")

        # レート制限回避
        time.sleep(1.5)

    return results


def _download_video(url: str, label: str) -> Optional[str]:
    """yt-dlpで動画DL"""
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
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        err = result.stderr.strip().split("\n")[-1] if result.stderr else "unknown"
        print(f"  DL failed: {err}")
        return None

    # yt-dlpが拡張子を変えることがあるので探す
    for ext in [".mp4", ".webm", ".mkv"]:
        p = VIDEOS_DIR / f"{label}{ext}"
        if p.exists():
            return str(p)
    matches = list(VIDEOS_DIR.glob(f"{label}.*"))
    return str(matches[0]) if matches else None


def _extract_frames(video_path: str, label: str) -> List[str]:
    """ffmpegでフレーム抽出"""
    # 動画長を取得
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True
    )
    duration = float(probe.stdout.strip()) if probe.stdout.strip() else 15.0

    times = [t for t in FRAME_TIMES if t < duration]
    if not times:
        times = [0.5]
    while len(times) < 3 and times[-1] + 2 < duration:
        times.append(times[-1] + 2)

    paths = []
    for i, t in enumerate(times[:3]):
        out_file = str(SCREENSHOTS_DIR / f"{label}_{i + 1}.png")
        cmd = [
            "ffmpeg", "-y", "-ss", str(t),
            "-i", video_path, "-vframes", "1", "-q:v", "2",
            out_file,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and Path(out_file).exists():
            paths.append(out_file)

    return paths


def _get_metadata(url: str) -> Dict:
    """yt-dlpでメタデータ取得"""
    cmd = [
        "yt-dlp",
        "--no-check-certificates",
        "--dump-json",
        "--no-download",
        "--socket-timeout", "15",
        url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
    except Exception:
        pass
    return {}


def _format_count(count) -> Optional[str]:
    """数値を表示用文字列に変換"""
    if count is None:
        return None
    count = int(count)
    if count >= 10000:
        return f"{count / 10000:.1f}万"
    return str(count)
