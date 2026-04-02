#!/usr/bin/env python3
"""
バズりリール自動発見（ログイン不要）

ソース:
  - DuckDuckGo → Instagram リールURL収集
  - YouTube Shorts → キーワード検索
  - TikTok → キーワード検索

使い方:
  python3 main.py discover [--max 30]
  python3 main.py discover --topic "料理 手元"
"""
import re
import subprocess
import json
import time
import urllib.parse
from typing import List, Dict


def discover_instagram_reels(query: str, max_results: int = 15) -> List[str]:
    """DuckDuckGo liteでInstagramリールURLを収集"""
    urls = []
    seen = set()

    search_queries = [
        f'site:instagram.com/reel {query}',
        f'site:instagram.com/reel {query} 万回',
    ]

    for sq in search_queries:
        found = _ddg_search(sq)
        for u in found:
            if u not in seen:
                seen.add(u)
                urls.append(u)
        if len(urls) >= max_results:
            break
        time.sleep(1.5)

    return urls[:max_results]


def discover_youtube_shorts(query: str, max_results: int = 15) -> List[Dict]:
    """YouTube Shortsをキーワード検索"""
    search_term = f"ytsearch{max_results * 2}:{query} #shorts"
    cmd = [
        "yt-dlp", "--flat-playlist", "--dump-json",
        "--no-check-certificates", "--socket-timeout", "15",
        search_term,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    entries = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        try:
            d = json.loads(line)
            duration = d.get("duration") or 0
            # 60秒以下のみ（ショート動画）
            if duration and duration <= 60:
                entries.append({
                    "url": f"https://youtube.com/shorts/{d['id']}",
                    "id": d.get("id"),
                    "title": d.get("title", ""),
                    "uploader": d.get("uploader") or d.get("channel", ""),
                    "view_count": d.get("view_count"),
                    "like_count": d.get("like_count"),
                    "comment_count": d.get("comment_count"),
                    "duration": duration,
                })
        except (json.JSONDecodeError, KeyError):
            continue

    # 再生数順ソート
    entries.sort(key=lambda x: x.get("view_count") or 0, reverse=True)
    return entries[:max_results]


def _ddg_search(query: str) -> List[str]:
    """DuckDuckGo lite でInstagramリールURLを抽出"""
    encoded = urllib.parse.quote(query)
    cmd = [
        "curl", "-sL",
        "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        f"https://lite.duckduckgo.com/lite/?q={encoded}",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        matches = re.findall(r'instagram\.com/reel/([A-Za-z0-9_-]+)', result.stdout)
        return [f"https://www.instagram.com/reel/{rid}/" for rid in dict.fromkeys(matches)]
    except Exception:
        return []


# 参考動画の内容分析に基づくトピック
TOPICS = [
    # 型A系（顔出しなし/手元・テキスト）
    "料理 手元 vlog ショート動画",
    "雑学 豆知識 解説",
    "あるある 共感 日常",
    "子育て エピソード",
    "節約 生活 ハック",
    # 型B系（顔出し/語り）
    "一人語り トーク 雑談",
    "夫婦 恋愛 エピソード",
    "海外の反応 日本 文化",
    "社会問題 意見",
    "外国人 日本語 カルチャー",
]


def discover_all(topics: List[str] = None, max_per_topic: int = 5,
                 sources: List[str] = None) -> List[Dict]:
    """複数トピック x 複数ソースでリールを発見"""
    topics = topics or TOPICS
    sources = sources or ["instagram", "youtube"]
    all_entries = []
    seen_urls = set()

    for topic in topics:
        print(f"\n>> Topic: {topic}")

        if "instagram" in sources:
            ig_urls = discover_instagram_reels(topic, max_per_topic)
            for url in ig_urls:
                if url not in seen_urls:
                    seen_urls.add(url)
                    all_entries.append({
                        "url": url, "source": "instagram", "topic": topic,
                    })
            print(f"  Instagram: {len(ig_urls)} reels")

        if "youtube" in sources:
            yt_entries = discover_youtube_shorts(topic, max_per_topic)
            for e in yt_entries:
                if e["url"] not in seen_urls:
                    seen_urls.add(e["url"])
                    e["source"] = "youtube"
                    e["topic"] = topic
                    all_entries.append(e)
            print(f"  YouTube: {len(yt_entries)} shorts")

        time.sleep(1)

    print(f"\n=== Total discovered: {len(all_entries)} ===")
    return all_entries


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        print("=== Instagram ===")
        ig = discover_instagram_reels(query, 10)
        for u in ig:
            print(f"  {u}")

        print("\n=== YouTube Shorts ===")
        yt = discover_youtube_shorts(query, 10)
        for e in yt:
            views = e.get("view_count") or "?"
            print(f"  {e['url']} | {e['title'][:35]} | views={views}")
    else:
        results = discover_all(TOPICS[:3], max_per_topic=3)
        for r in results:
            print(f"  [{r.get('source','?')}] {r['url']}")
