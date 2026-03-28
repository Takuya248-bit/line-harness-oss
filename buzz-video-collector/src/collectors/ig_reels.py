from __future__ import annotations
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Optional
from src.collectors.base import BaseCollector, VideoItem

PROFILE_DIR = str(Path(__file__).parent.parent.parent / ".pw-profile")
SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "screenshots"

def _yt_dlp_meta(url: str) -> Optional[dict]:
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None

def _meta_to_video_item(meta: dict, screenshot_path: str = "") -> VideoItem:
    posted = None
    if meta.get("upload_date"):
        try:
            posted = datetime.strptime(meta["upload_date"], "%Y%m%d")
        except ValueError:
            pass
    return VideoItem(
        url=meta.get("webpage_url", meta.get("original_url", "")),
        source="ig_reels",
        caption=meta.get("description", ""),
        likes=meta.get("like_count", 0) or 0,
        views=meta.get("view_count", 0) or 0,
        comments=meta.get("comment_count", 0) or 0,
        screenshot_path=screenshot_path,
        posted_at=posted,
    )

class IGReelsCollector(BaseCollector):
    source_name = "ig_reels"

    def __init__(self, config: dict):
        self._accounts = config.get("accounts", [])
        self._hashtags = config.get("hashtags", [])
        self._max_items = config.get("max_items", 100)
        self._parallel = config.get("yt_dlp_parallel", 5)

    def collect(self) -> list[VideoItem]:
        from playwright.sync_api import sync_playwright
        urls = set()
        with sync_playwright() as p:
            print("  ブラウザ起動...")
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=PROFILE_DIR, headless=False, channel="chrome",
                viewport={"width": 430, "height": 932}, locale="ja-JP",
            )
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            for account in self._accounts:
                print(f"  account: @{account}")
                try:
                    page.goto(f"https://www.instagram.com/{account}/reels/",
                              wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    links = page.eval_on_selector_all(
                        'a[href*="/reel/"], a[href*="/p/"]', "els => els.map(e => e.href)")
                    for link in links:
                        match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', link)
                        if match:
                            urls.add(f"https://www.instagram.com/p/{match.group(1)}/")
                    print(f"    {len(links)}件のリンク取得")
                except Exception as e:
                    print(f"    error: {e}")
                if len(urls) >= self._max_items:
                    break
            for tag in self._hashtags:
                if len(urls) >= self._max_items:
                    break
                print(f"  hashtag: #{tag}")
                try:
                    page.goto(f"https://www.instagram.com/explore/tags/{tag}/",
                              wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    links = page.eval_on_selector_all(
                        'a[href*="/reel/"], a[href*="/p/"]', "els => els.map(e => e.href)")
                    for link in links:
                        match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', link)
                        if match:
                            urls.add(f"https://www.instagram.com/p/{match.group(1)}/")
                    print(f"    {len(links)}件のリンク取得")
                except Exception as e:
                    print(f"    error: {e}")
            ctx.close()
        url_list = list(urls)[:self._max_items]
        print(f"  URL収集完了: {len(url_list)}件")
        print(f"  yt-dlp {self._parallel}並列でメタ取得中...")
        items = []
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        with ThreadPoolExecutor(max_workers=self._parallel) as executor:
            futures = {executor.submit(_yt_dlp_meta, url): url for url in url_list}
            done = 0
            for future in as_completed(futures):
                done += 1
                meta = future.result()
                if meta:
                    items.append(_meta_to_video_item(meta))
                if done % 10 == 0:
                    print(f"    {done}/{len(url_list)} 完了")
        print(f"  メタ取得完了: {len(items)}/{len(url_list)}件成功")
        return items

class IGReelsScreenshotter:
    def capture(self, urls: list[str], output_dir: str | Path = SCREENSHOT_DIR) -> dict[str, str]:
        from playwright.sync_api import sync_playwright
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        result = {}
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=PROFILE_DIR, headless=False, channel="chrome",
                viewport={"width": 430, "height": 932}, locale="ja-JP",
            )
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            for i, url in enumerate(urls):
                try:
                    reel_url = url.replace("/p/", "/reel/")
                    page.goto(reel_url, wait_until="domcontentloaded", timeout=15000)
                    time.sleep(3)
                    ss_path = output_dir / f"reel_{i:04d}.png"
                    page.screenshot(path=str(ss_path))
                    result[url] = str(ss_path)
                except Exception:
                    pass
            ctx.close()
        return result
