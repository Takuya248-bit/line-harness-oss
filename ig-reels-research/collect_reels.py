#!/usr/bin/env python3
"""
Instagram Reels収集スクリプト v10
- リールおすすめ欄をArrowDownでスクロール
- 各リールのテキスト（ユーザー名・いいね数・コメント数）をDOMから直接取得
- 超高速: yt-dlp不要
"""
import csv
import time
import re
import json
from datetime import datetime, timedelta
from pathlib import Path

PROFILE_DIR = str(Path(__file__).parent / ".pw-profile")
OUTPUT_CSV = Path(__file__).parent / "results.csv"
RAW_JSON = Path(__file__).parent / "raw_data.json"

MIN_LIKES = 10000
MIN_COMMENTS = 300
MIN_DURATION = 20
MAX_AGE_DAYS = 30
SCROLL_COUNT = 150


def format_count(n):
    if n is None:
        return ""
    n = int(n)
    if n >= 10000:
        return f"{n/10000:.1f}万"
    return f"{n:,}"


def parse_ig_number(text):
    """Instagram表記→数値: '8.9万'→89000, '1,234'→1234"""
    if not text:
        return 0
    text = text.strip().replace(",", "").replace("，", "")
    m = re.match(r'([\d.]+)\s*万', text)
    if m:
        return int(float(m.group(1)) * 10000)
    m = re.match(r'([\d.]+)\s*[Mm]', text)
    if m:
        return int(float(m.group(1)) * 1000000)
    m = re.match(r'([\d.]+)\s*[Kk]', text)
    if m:
        return int(float(m.group(1)) * 1000)
    m = re.match(r'(\d+)', text)
    if m:
        return int(m.group(1))
    return 0


def extract_current_reel_data(page):
    """現在表示中のリールからデータ抽出"""
    try:
        data = page.evaluate(r'''() => {
            const result = {url: window.location.href};

            // ページ内の全テキストをセクションごとに取得
            const body = document.body.innerText;
            const lines = body.split('\n').map(l => l.trim()).filter(l => l);

            // いいね数: "いいね！" の後or前にある数字
            // パターン: "いいね！" の近くの行に数値がある
            let likeIdx = lines.findIndex(l => l === 'いいね！' || l.includes('いいね！'));
            if (likeIdx >= 0) {
                // いいね！の前後3行以内で数値を探す
                for (let i = Math.max(0, likeIdx - 3); i <= Math.min(lines.length - 1, likeIdx + 3); i++) {
                    const line = lines[i];
                    if (/^[\d,.]+万?$/.test(line)) {
                        result.likes_text = line;
                        break;
                    }
                }
            }

            // ユーザー名: 最初のプロフィールリンク
            const profileLinks = document.querySelectorAll('a[href^="/"]');
            for (const link of profileLinks) {
                const href = link.getAttribute('href') || '';
                if (/^\/[a-zA-Z0-9_.]+\/?$/.test(href) &&
                    !/^\/(reels|explore|direct|accounts|p|stories|reel)/.test(href)) {
                    const text = link.textContent.trim();
                    if (text && text.length < 40 && text.length > 1) {
                        result.username = text;
                        break;
                    }
                }
            }

            // 動画の長さ
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                // 可視領域内のvideo
                for (const v of videos) {
                    const rect = v.getBoundingClientRect();
                    if (rect.top > -100 && rect.bottom < window.innerHeight + 100) {
                        result.duration = v.duration || 0;
                        break;
                    }
                }
            }

            // テキスト行を全部返す（デバッグ用 + コメント数抽出用）
            // 現在表示中のリールの数値データを取得
            const numbers = [];
            for (const line of lines) {
                if (/^[\d,.]+万?$/.test(line)) {
                    numbers.push(line);
                }
            }
            result.numbers = numbers.slice(0, 10);
            result.first_lines = lines.slice(0, 30);

            return result;
        }''')
        return data
    except Exception:
        return None


def main():
    from playwright.sync_api import sync_playwright

    print("=" * 50)
    print("Instagram Reels 収集ツール v10")
    print("  リールおすすめ欄 + DOMテキスト直接取得")
    print("=" * 50)
    print(f"条件: likes>={MIN_LIKES:,} cmt>={MIN_COMMENTS:,} {MIN_DURATION}秒以上\n")

    reels = []
    seen_urls = set()

    with sync_playwright() as p:
        print("ブラウザ起動中...")
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=False,
            channel="chrome",
            viewport={"width": 430, "height": 932},
            locale="ja-JP",
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        page.goto("https://www.instagram.com/reels/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)

        if "login" in page.url:
            print("ログインが必要です。ブラウザでログインしてください...")
            for _ in range(300):
                time.sleep(1)
                if "login" not in page.url:
                    break
            else:
                ctx.close()
                return
            time.sleep(2)
            page.goto("https://www.instagram.com/reels/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(5)

        # まず最初のリールのデータ構造を確認
        print("\nデータ構造確認中...")
        test_data = extract_current_reel_data(page)
        if test_data:
            print(f"  URL: {test_data.get('url', 'N/A')}")
            print(f"  Username: {test_data.get('username', 'N/A')}")
            print(f"  Likes text: {test_data.get('likes_text', 'N/A')}")
            print(f"  Duration: {test_data.get('duration', 'N/A')}")
            print(f"  Numbers found: {test_data.get('numbers', [])}")
            print(f"  First lines: {test_data.get('first_lines', [])[:10]}")

        print(f"\n{SCROLL_COUNT}リールをスクロール収集中...\n")

        for i in range(SCROLL_COUNT):
            page.keyboard.press("ArrowDown")
            time.sleep(2)

            current_url = page.url
            m = re.search(r'/reels?/([A-Za-z0-9_-]{8,})', current_url)
            if not m:
                continue

            reel_id = m.group(1)
            reel_url = f"https://www.instagram.com/reel/{reel_id}/"

            if reel_url in seen_urls:
                continue
            seen_urls.add(reel_url)

            data = extract_current_reel_data(page)
            if not data:
                print(f"  [{i+1}/{SCROLL_COUNT}] データ取得失敗")
                continue

            # 数値リストから いいね数とコメント数を推定
            # IGリールのテキスト構造: ユーザー名 → (場所) → キャプション → いいね数 → コメント数
            numbers = data.get("numbers", [])
            likes_text = data.get("likes_text", "")
            username = data.get("username", "")
            duration = data.get("duration", 0) or 0

            # いいね数
            likes = parse_ig_number(likes_text) if likes_text else 0
            if not likes and len(numbers) >= 1:
                likes = parse_ig_number(numbers[0])

            # コメント数 (いいね数の次の数値)
            comments = 0
            if likes_text and len(numbers) >= 2:
                for j, n in enumerate(numbers):
                    if n == likes_text and j + 1 < len(numbers):
                        comments = parse_ig_number(numbers[j + 1])
                        break
            elif len(numbers) >= 2:
                comments = parse_ig_number(numbers[1])

            entry = {
                "url": reel_url,
                "reel_id": reel_id,
                "username": username,
                "likes": likes,
                "comments": comments,
                "duration": duration,
                "raw_numbers": numbers[:5],
            }
            reels.append(entry)

            # 表示
            status = ""
            if likes >= MIN_LIKES and comments >= MIN_COMMENTS and duration >= MIN_DURATION:
                status = "PASS"
            elif likes >= 5000 and duration >= MIN_DURATION:
                status = "候補"

            if status:
                print(f"  [{i+1}/{SCROLL_COUNT}] {status} ❤{format_count(likes)} 💬{comments} {duration:.0f}秒 @{username}")
            else:
                print(f"  [{i+1}/{SCROLL_COUNT}] ❤{format_count(likes)} 💬{comments} {duration:.0f}秒 @{username}", end="\r")

        print(f"\n\n収集完了: {len(reels)}件")
        ctx.close()

    # 生データ保存
    with open(RAW_JSON, 'w', encoding='utf-8') as f:
        json.dump(reels, f, ensure_ascii=False, indent=2)
    print(f"生データ: {RAW_JSON}")

    # フィルタリング + CSV
    passed = [r for r in reels if r["likes"] >= MIN_LIKES and r["comments"] >= MIN_COMMENTS and r["duration"] >= MIN_DURATION]
    near_miss = [r for r in reels if r not in passed and r["likes"] >= 5000 and r["duration"] >= MIN_DURATION]

    passed.sort(key=lambda x: x["likes"], reverse=True)
    near_miss.sort(key=lambda x: x["likes"], reverse=True)

    all_results = []
    for r in passed:
        r["judgment"] = "PASS"
        all_results.append(r)
    for r in near_miss:
        r["judgment"] = "惜しい"
        all_results.append(r)

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["URL", "投稿者", "いいね数", "コメント数", "秒数", "判定", "メモ"])
        for r in all_results:
            w.writerow([
                r["url"], r["username"][:30],
                format_count(r["likes"]), format_count(r["comments"]),
                f"{r['duration']:.0f}", r["judgment"], "",
            ])

    print(f"\n=== 完了 ===")
    print(f"PASS: {len(passed)}件 / 惜しい: {len(near_miss)}件 / 全収集: {len(reels)}件")
    print(f"CSV: {OUTPUT_CSV}")

    if passed:
        print("\n--- PASS ---")
        for r in passed:
            print(f"  ❤{format_count(r['likes'])} 💬{r['comments']} {r['duration']:.0f}秒 @{r['username']} {r['url']}")


if __name__ == "__main__":
    main()
