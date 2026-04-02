#!/usr/bin/env python3
"""
Instagram リール半自動リサーチツール（ログイン不要版）

使い方:
  # バズりリール自動発見（おすすめ）
  python3 main.py discover [--max 30]
  python3 main.py discover --topic "料理 手元" --ig-only
  python3 main.py discover --topic "海外の反応" --yt-only

  # アカウント/URL指定
  python3 main.py search --account username [--max 20]
  python3 main.py search --file urls.txt
  python3 main.py search --channel "https://www.youtube.com/@user/shorts"

  # 結果確認・判定
  python3 main.py review
  python3 main.py status <id> ok|ng [notes]
  python3 main.py status ok 1,2,3  (一括)
  python3 main.py show <id>

  # レポート・メンテ
  python3 main.py report
  python3 main.py rescore
  python3 main.py cleanup
"""
import sys
from typing import List

from db import (init_db, insert_reel, update_reel_status, update_reel_scores,
                get_pending_reels, get_all_reels, reel_exists,
                register_reference, get_reference_images)
from analyzer import score_against_references
from config import REFERENCE_TYPE_A_DIR, REFERENCE_TYPE_B_DIR


def cmd_init():
    """DB初期化 & 参考画像登録"""
    init_db()
    for type_, dir_ in [("a", REFERENCE_TYPE_A_DIR), ("b", REFERENCE_TYPE_B_DIR)]:
        existing = set(get_reference_images(type_))
        for ext in ("*.png", "*.jpg", "*.jpeg"):
            for f in dir_.glob(ext):
                if str(f) not in existing:
                    register_reference(type_, str(f))
                    print(f"  Registered {type_.upper()}: {f.name}")
    ref_a = list(REFERENCE_TYPE_A_DIR.glob("*.*"))
    ref_b = list(REFERENCE_TYPE_B_DIR.glob("*.*"))
    print(f"Reference: Type A={len(ref_a)}, Type B={len(ref_b)}")


def cmd_search(source: str, value: str, max_count: int = 20):
    """リサーチ実行"""
    init_db()
    cmd_init()

    from scraper import (fetch_reel_urls_from_account, fetch_reel_urls_from_channel,
                         download_and_extract_batch)

    entries = []
    if source == "account":
        entries = fetch_reel_urls_from_account(value, max_count)
    elif source == "channel":
        entries = fetch_reel_urls_from_channel(value, max_count)
    elif source == "file":
        with open(value) as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        entries = [{"url": u} for u in urls[:max_count]]
    elif source == "urls":
        entries = [{"url": u} for u in value.split(",")]

    if not entries:
        print("No entries found.")
        return

    print(f"\nProcessing {len(entries)} entries...")
    results = download_and_extract_batch(entries, skip_existing_fn=reel_exists)

    saved = 0
    for r in results:
        screenshots = r.get("screenshots", [])
        if not screenshots:
            continue

        score_a = score_against_references(screenshots, "a")
        score_b = score_against_references(screenshots, "b")
        print(f"  Score: A={score_a:.3f} B={score_b:.3f}")

        reel_id = insert_reel(
            url=r["url"],
            username=r.get("username"),
            screenshots=screenshots,
            score_a=score_a,
            score_b=score_b,
            likes=r.get("likes"),
            comments=r.get("comments"),
        )
        print(f"  -> Saved #{reel_id}")
        saved += 1

    print(f"\n=== Done: {saved}/{len(results)} saved ===")
    print("Run: python3 main.py review")


def cmd_review():
    """保留中リールをスコア順に一覧表示"""
    init_db()
    reels = get_pending_reels()

    if not reels:
        print("No pending reels.")
        return

    print(f"\n{'ID':>4} {'ScoreA':>7} {'ScoreB':>7} {'Likes':>8} {'Cmt':>8} {'User':>15} URL")
    print("-" * 100)
    for r in reels:
        total = r['score_type_a'] + r['score_type_b']
        marker = " ***" if total > 1.0 else " **" if total > 0.7 else ""
        print(f"{r['id']:>4} {r['score_type_a']:>7.3f} {r['score_type_b']:>7.3f} "
              f"{r['likes_count'] or '-':>8} {r['comments_count'] or '-':>8} "
              f"{(r['username'] or '?')[:15]:>15} "
              f"{r['url'][:45]}{marker}")

    print(f"\nTotal: {len(reels)} pending")
    print("*** = high match | ** = moderate match")
    print("Usage: python3 main.py status <id> ok|ng [notes]")


def cmd_status(reel_id: int, status: str, notes: str = None):
    """ステータス更新"""
    init_db()
    update_reel_status(reel_id, status, notes)
    print(f"Reel #{reel_id} -> {status}" + (f" ({notes})" if notes else ""))


def cmd_batch_status(status: str, ids: List[int]):
    """複数リールのステータスを一括更新"""
    init_db()
    for reel_id in ids:
        update_reel_status(reel_id, status)
        print(f"  #{reel_id} -> {status}")
    print(f"Updated {len(ids)} reels")


def cmd_report():
    """レポート"""
    init_db()
    reels = get_all_reels()

    ok = [r for r in reels if r["status"] == "ok"]
    ng = [r for r in reels if r["status"] == "ng"]
    pending = [r for r in reels if r["status"] == "pending"]

    print(f"\n=== Reel Research Report ===")
    print(f"Total: {len(reels)} | OK: {len(ok)} | NG: {len(ng)} | Pending: {len(pending)}")

    if ok:
        print(f"\n--- Approved ({len(ok)}) ---")
        for r in ok:
            print(f"  #{r['id']} @{r['username'] or '?'} "
                  f"A={r['score_type_a']:.3f} B={r['score_type_b']:.3f} "
                  f"likes={r['likes_count'] or '?'} {r['url']}")

    if pending:
        print(f"\n--- Top Pending ---")
        top = sorted(pending, key=lambda r: r["score_type_a"] + r["score_type_b"], reverse=True)[:10]
        for r in top:
            print(f"  #{r['id']} A={r['score_type_a']:.3f} B={r['score_type_b']:.3f} "
                  f"likes={r['likes_count'] or '?'} {r['url'][:50]}")


def cmd_rescore():
    """全スコア再計算"""
    init_db()
    cmd_init()
    reels = get_all_reels()
    for r in reels:
        screenshots = [r["screenshot_1"], r["screenshot_2"], r["screenshot_3"]]
        screenshots = [s for s in screenshots if s]
        if not screenshots:
            continue
        score_a = score_against_references(screenshots, "a")
        score_b = score_against_references(screenshots, "b")
        update_reel_scores(r["id"], score_a, score_b)
        print(f"  #{r['id']}: A={score_a:.3f} B={score_b:.3f}")
    print("Rescoring complete.")


def cmd_show(reel_id: int):
    """リール詳細表示"""
    init_db()
    from db import get_connection
    conn = get_connection()
    r = conn.execute("SELECT * FROM reels WHERE id = ?", (reel_id,)).fetchone()
    conn.close()

    if not r:
        print(f"Reel #{reel_id} not found.")
        return

    print(f"\n=== Reel #{r['id']} ===")
    print(f"URL:      {r['url']}")
    print(f"User:     {r['username'] or '?'}")
    print(f"Status:   {r['status']}")
    print(f"Score A:  {r['score_type_a']:.4f}")
    print(f"Score B:  {r['score_type_b']:.4f}")
    print(f"Likes:    {r['likes_count'] or '?'}")
    print(f"Comments: {r['comments_count'] or '?'}")
    print(f"Notes:    {r['notes'] or '-'}")
    print(f"Created:  {r['created_at']}")
    for i in range(1, 4):
        ss = r[f'screenshot_{i}']
        if ss:
            print(f"SS {i}:    {ss}")


def cmd_discover(topic: str = None, max_count: int = 30,
                 sources: List[str] = None):
    """バズりリールを自動発見→DL→スコアリング"""
    init_db()
    cmd_init()

    from discover import discover_all, discover_instagram_reels, discover_youtube_shorts, TOPICS
    from scraper import download_and_extract_batch

    if topic:
        topics = [topic]
    else:
        topics = TOPICS

    sources = sources or ["instagram", "youtube"]
    per_topic = max(2, max_count // len(topics))

    # 1. URL発見フェーズ
    print("=== Phase 1: Discovering reels ===")
    entries = discover_all(topics, max_per_topic=per_topic, sources=sources)

    if not entries:
        print("No reels found.")
        return

    # 既存を除外
    new_entries = [e for e in entries if not reel_exists(e["url"])]
    print(f"\nNew: {len(new_entries)} / Total: {len(entries)}")

    if not new_entries:
        print("All reels already processed.")
        return

    # max_count制限
    new_entries = new_entries[:max_count]

    # 2. DL→フレーム抽出フェーズ
    print(f"\n=== Phase 2: Download & extract ({len(new_entries)} reels) ===")
    results = download_and_extract_batch(new_entries, skip_existing_fn=reel_exists)

    # 3. スコアリング & DB保存
    print(f"\n=== Phase 3: Scoring ===")
    saved = 0
    for r in results:
        screenshots = r.get("screenshots", [])
        if not screenshots:
            continue

        score_a = score_against_references(screenshots, "a")
        score_b = score_against_references(screenshots, "b")

        reel_id = insert_reel(
            url=r["url"],
            username=r.get("username"),
            screenshots=screenshots,
            score_a=score_a,
            score_b=score_b,
            likes=r.get("likes"),
            comments=r.get("comments"),
        )
        marker = " ***" if score_a + score_b > 1.0 else ""
        print(f"  #{reel_id} A={score_a:.3f} B={score_b:.3f} {r['url'][:50]}{marker}")
        saved += 1

    print(f"\n=== Complete: {saved} reels saved ===")
    print("Run: python3 main.py review")


def cmd_cleanup():
    """ダウンロード済み動画を削除（容量節約）"""
    from config import SCREENSHOTS_DIR
    import shutil
    videos_dir = Path(__file__).parent / "downloads"
    if videos_dir.exists():
        size = sum(f.stat().st_size for f in videos_dir.rglob("*") if f.is_file())
        shutil.rmtree(videos_dir)
        print(f"Deleted downloads/ ({size / 1024 / 1024:.1f} MB)")
    else:
        print("No downloads to clean.")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]

    if cmd == "init":
        cmd_init()

    elif cmd == "search":
        args = sys.argv[2:]
        source, value, max_count = None, None, 20
        i = 0
        while i < len(args):
            if args[i] == "--account" and i + 1 < len(args):
                source, value = "account", args[i + 1]; i += 2
            elif args[i] == "--file" and i + 1 < len(args):
                source, value = "file", args[i + 1]; i += 2
            elif args[i] == "--channel" and i + 1 < len(args):
                source, value = "channel", args[i + 1]; i += 2
            elif args[i] == "--urls" and i + 1 < len(args):
                source, value = "urls", args[i + 1]; i += 2
            elif args[i] == "--max" and i + 1 < len(args):
                max_count = int(args[i + 1]); i += 2
            else:
                i += 1
        if not source:
            print("Usage: python3 main.py search --account <username> [--max 20]")
            print("       python3 main.py search --file <urls.txt> [--max 20]")
            print("       python3 main.py search --channel <url> [--max 20]")
            return
        cmd_search(source, value, max_count)

    elif cmd == "discover":
        args = sys.argv[2:]
        topic, max_count, sources = None, 30, None
        i = 0
        while i < len(args):
            if args[i] == "--topic" and i + 1 < len(args):
                topic = args[i + 1]; i += 2
            elif args[i] == "--max" and i + 1 < len(args):
                max_count = int(args[i + 1]); i += 2
            elif args[i] == "--ig-only":
                sources = ["instagram"]; i += 1
            elif args[i] == "--yt-only":
                sources = ["youtube"]; i += 1
            else:
                i += 1
        cmd_discover(topic, max_count, sources)

    elif cmd == "review":
        cmd_review()

    elif cmd == "status":
        if len(sys.argv) < 4:
            print("Usage: python3 main.py status <id> ok|ng [notes]")
            print("       python3 main.py status ok 1,2,3  (batch)")
            return
        # バッチモード: status ok 1,2,3
        if sys.argv[2] in ("ok", "ng") and "," in sys.argv[3]:
            ids = [int(x) for x in sys.argv[3].split(",")]
            cmd_batch_status(sys.argv[2], ids)
        else:
            reel_id = int(sys.argv[2])
            status = sys.argv[3]
            notes = " ".join(sys.argv[4:]) if len(sys.argv) > 4 else None
            cmd_status(reel_id, status, notes)

    elif cmd == "show":
        if len(sys.argv) < 3:
            print("Usage: python3 main.py show <id>")
            return
        cmd_show(int(sys.argv[2]))

    elif cmd == "report":
        cmd_report()

    elif cmd == "rescore":
        cmd_rescore()

    elif cmd == "cleanup":
        cmd_cleanup()

    else:
        print(f"Unknown: {cmd}")
        print(__doc__)


if __name__ == "__main__":
    main()
