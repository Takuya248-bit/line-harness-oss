#!/usr/bin/env python3
"""
高速リサーチ v2: 検索段階で日付+再生数フィルタ
- DuckDuckGo: df=m（1ヶ月以内）
- YouTube: sp=CAMSBAgEEAE（今月+再生数順+ショート）
"""
import subprocess
import json
import csv
import time
import re
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

OUTPUT_CSV = Path(__file__).parent / "results.csv"

MIN_LIKES = 10000
MIN_COMMENTS_IG = 1000
MIN_COMMENTS_YT = 500
MAX_AGE_DAYS = 30

TOPICS = [
    "料理 手元 vlog",
    "雑学 豆知識",
    "あるある 共感",
    "子育て あるある",
    "節約 生活",
    "トーク 雑談 語り",
    "夫婦 恋愛",
    "海外の反応 日本",
    "社会問題",
    "外国人 日本語",
    "ダイエット",
    "恋愛 告白",
    "バズ 面白い",
    "暮らし ルーティン",
    "美容 スキンケア",
]


def discover_ig_recent(query: str, max_n: int = 15) -> List[str]:
    """DuckDuckGo 1ヶ月以内フィルタ"""
    encoded = urllib.parse.quote(f"site:instagram.com/reel {query}")
    # df=m = past month
    cmd = ["curl", "-sL", "-H",
           "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
           f"https://lite.duckduckgo.com/lite/?q={encoded}&df=m"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        ids = re.findall(r'instagram\.com/reel/([A-Za-z0-9_-]+)', r.stdout)
        return [f"https://www.instagram.com/reel/{rid}/" for rid in dict.fromkeys(ids)][:max_n]
    except Exception:
        return []


def discover_yt_trending(query: str, max_n: int = 15) -> List[Dict]:
    """YouTube Shorts: 今月+再生数順"""
    # sp=CAMSBAgEEAE = sort by view count, this month, short videos
    encoded = urllib.parse.quote(f"{query} ショート動画")
    url = f"https://www.youtube.com/results?search_query={encoded}&sp=CAMSBAgEEAE"
    cmd = ["yt-dlp", "--flat-playlist", "--dump-json", "--no-check-certificates",
           "--socket-timeout", "15", "--playlist-end", str(max_n * 2), url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        entries = []
        for line in r.stdout.strip().split("\n"):
            if not line.strip():
                continue
            try:
                d = json.loads(line)
                dur = d.get("duration") or 0
                if dur and dur <= 60:
                    entries.append({
                        "url": f"https://youtube.com/shorts/{d['id']}",
                        "source": "youtube",
                        "view_count": d.get("view_count"),
                        "like_count": d.get("like_count"),
                        "comment_count": d.get("comment_count"),
                    })
            except (json.JSONDecodeError, KeyError):
                continue
        return entries[:max_n]
    except Exception:
        return []


def fetch_meta(url: str) -> Optional[Dict]:
    cmd = ["yt-dlp", "--no-check-certificates", "--dump-json",
           "--no-download", "--socket-timeout", "10", url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout.strip())
    except Exception:
        pass
    return None


def passes_filter(meta: Dict, source: str) -> bool:
    likes = meta.get("like_count") or 0
    comments = meta.get("comment_count") or 0
    upload = meta.get("upload_date") or ""

    if likes < MIN_LIKES:
        return False

    min_comments = MIN_COMMENTS_IG if source == "instagram" else MIN_COMMENTS_YT
    if comments < min_comments:
        return False

    if upload and len(upload) == 8:
        try:
            posted = datetime.strptime(upload, "%Y%m%d")
            if (datetime.now() - posted).days > MAX_AGE_DAYS:
                return False
        except ValueError:
            pass

    return True


def format_date(d):
    if d and len(d) == 8:
        return f"{d[:4]}/{d[4:6]}/{d[6:8]}"
    return str(d) if d else ""


def format_count(n):
    if n is None: return ""
    n = int(n)
    if n >= 10000: return f"{n/10000:.1f}万"
    return f"{n:,}"


def run(max_total: int = 50):
    cutoff = datetime.now() - timedelta(days=MAX_AGE_DAYS)
    print(f"=== フィルタ: likes>={MIN_LIKES:,} cmt>={MIN_COMMENTS_IG}(IG)/{MIN_COMMENTS_YT}(YT) {cutoff.strftime('%Y/%m/%d')}以降 ===\n")

    # Phase 1: URL収集（日付フィルタ付き）
    print("Phase 1: URL収集（1ヶ月以内）...")
    all_items = []  # {url, source}
    seen = set()

    for topic in TOPICS:
        print(f"  [{topic[:12]:12}] ", end="", flush=True)

        ig = discover_ig_recent(topic, 10)
        for u in ig:
            if u not in seen:
                seen.add(u)
                all_items.append({"url": u, "source": "instagram"})

        yt = discover_yt_trending(topic, 10)
        for e in yt:
            if e["url"] not in seen:
                seen.add(e["url"])
                all_items.append(e)

        print(f"IG:{len(ig)} YT:{len(yt)}")
        time.sleep(0.8)

    print(f"\nTotal URLs: {len(all_items)}")

    # Phase 2: メタデータ+フィルタ（DLなし、高速）
    print(f"\nPhase 2: メタデータチェック...")
    passed = []

    for i, item in enumerate(all_items):
        url = item["url"]
        source = item["source"]
        print(f"  [{i+1}/{len(all_items)}] ", end="", flush=True)

        meta = fetch_meta(url)
        if not meta:
            print("skip")
            continue

        likes = meta.get("like_count") or 0
        comments = meta.get("comment_count") or 0
        upload = meta.get("upload_date") or ""

        if passes_filter(meta, source):
            passed.append({
                "url": url,
                "source": source,
                "username": meta.get("uploader") or meta.get("channel") or "",
                "title": (meta.get("title") or "")[:60],
                "likes": likes,
                "comments": comments,
                "upload_date": upload,
                "view_count": meta.get("view_count") or 0,
            })
            print(f"PASS ❤{format_count(likes)} 💬{format_count(comments)} {format_date(upload)}")
        else:
            reason = []
            if likes < MIN_LIKES:
                reason.append(f"likes={format_count(likes)}")
            min_c = MIN_COMMENTS_IG if source == "instagram" else MIN_COMMENTS_YT
            if comments < min_c:
                reason.append(f"cmt={comments}")
            if upload and len(upload) == 8:
                try:
                    if (datetime.now() - datetime.strptime(upload, "%Y%m%d")).days > MAX_AGE_DAYS:
                        reason.append(f"old={format_date(upload)}")
                except ValueError:
                    pass
            print(f"fail ({', '.join(reason)})")

        time.sleep(0.3)

        if len(passed) >= max_total:
            print(f"\n上限{max_total}件到達、打ち切り")
            break

    print(f"\nPassed: {len(passed)}/{i+1}")

    # Phase 3: CSV出力（DL不要、メタデータのみ）
    passed.sort(key=lambda x: x["likes"], reverse=True)

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["URL", "プラットフォーム", "投稿者", "タイトル",
                     "いいね数", "コメント数", "再生数", "投稿日", "メモ"])
        for r in passed:
            platform = "Instagram" if r["source"] == "instagram" else "YouTube"
            w.writerow([
                r["url"],
                platform,
                r["username"][:30],
                r["title"],
                format_count(r["likes"]),
                format_count(r["comments"]),
                format_count(r["view_count"]),
                format_date(r["upload_date"]),
                "",
            ])

    print(f"\n=== 完了 ===")
    print(f"結果: {len(passed)}件 → {OUTPUT_CSV}")

    if not passed:
        print("\n--- 基準に惜しかったもの（参考） ---")
        # 惜しかった: likes >= 5000 or comments >= 500
        near = []
        for item in all_items:
            meta = fetch_meta(item["url"])
            if not meta:
                continue
            likes = meta.get("like_count") or 0
            comments = meta.get("comment_count") or 0
            if likes >= 5000 or comments >= 500:
                near.append({"url": item["url"], "likes": likes, "comments": comments,
                             "date": format_date(meta.get("upload_date", ""))})
            if len(near) >= 10:
                break
        for n in near:
            print(f"  ❤{format_count(n['likes'])} 💬{n['comments']} {n['date']} {n['url']}")


if __name__ == "__main__":
    import sys
    max_total = 50
    for i, a in enumerate(sys.argv[1:]):
        if a == "--max":
            max_total = int(sys.argv[i + 2])
    run(max_total)
