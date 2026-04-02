#!/usr/bin/env python3
"""既存リールの投稿日をyt-dlpメタデータから取得してDB更新"""
import subprocess
import json
import time
from db import get_connection, init_db


def fetch_upload_date(url):
    cmd = [
        "yt-dlp", "--no-check-certificates", "--dump-json",
        "--no-download", "--socket-timeout", "10", url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout.strip())
            date = data.get("upload_date")  # YYYYMMDD形式
            if date and len(date) == 8:
                return f"{date[:4]}/{date[4:6]}/{date[6:8]}"
    except Exception:
        pass
    return None


def main():
    init_db()
    conn = get_connection()
    reels = conn.execute("SELECT id, url, upload_date FROM reels WHERE upload_date IS NULL").fetchall()
    conn.close()

    print(f"Fetching upload dates for {len(reels)} reels...")

    for i, r in enumerate(reels):
        print(f"  [{i+1}/{len(reels)}] #{r['id']} ", end="", flush=True)
        date = fetch_upload_date(r["url"])
        if date:
            conn = get_connection()
            conn.execute("UPDATE reels SET upload_date = ? WHERE id = ?", (date, r["id"]))
            conn.commit()
            conn.close()
            print(f"-> {date}")
        else:
            print("-> failed")
        time.sleep(0.5)

    print("Done.")


if __name__ == "__main__":
    main()
