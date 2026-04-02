#!/usr/bin/env python3
"""スマホ向けHTMLレポート生成"""
import sqlite3
import base64
import os
from pathlib import Path
from datetime import datetime
from db import get_connection, init_db

OUTPUT_PATH = Path(__file__).parent / "report.html"


def img_to_base64(path, max_width=300, quality=60):
    """画像を圧縮してbase64エンコード（HTMLに埋め込み用）"""
    if not path or not os.path.exists(path):
        return None
    try:
        from PIL import Image
        import io
        img = Image.open(path)
        # リサイズ
        ratio = max_width / img.width
        if ratio < 1:
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        # JPEG圧縮
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True)
        data = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/jpeg;base64,{data}"
    except Exception:
        return None


def get_type_label(score_a, score_b):
    """型判定ラベル"""
    if score_a > score_b + 0.05:
        return "A", "顔なし/テキスト系"
    elif score_b > score_a + 0.05:
        return "B", "顔出し/語り系"
    else:
        return "AB", "ミックス"


def match_level(score_a, score_b):
    total = score_a + score_b
    if total > 1.0:
        return "★★★", "#ff6b6b"
    elif total > 0.7:
        return "★★", "#ffa94d"
    else:
        return "★", "#adb5bd"


def generate_html():
    init_db()
    conn = get_connection()
    reels = conn.execute("""
        SELECT * FROM reels
        ORDER BY
            CASE status WHEN 'ok' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
            score_type_a + score_type_b DESC
    """).fetchall()
    conn.close()

    # テスト用（参考動画そのもの）を除外: スコア0.9以上は参考動画の可能性
    filtered = []
    for r in reels:
        if r["score_type_a"] > 0.95 or r["score_type_b"] > 0.95:
            continue
        filtered.append(r)

    now = datetime.now().strftime("%Y/%m/%d %H:%M")

    cards_html = ""
    for r in filtered:
        score_a = r["score_type_a"]
        score_b = r["score_type_b"]
        type_code, type_desc = get_type_label(score_a, score_b)
        stars, star_color = match_level(score_a, score_b)
        status = r["status"]
        status_badge = {
            "ok": '<span style="background:#51cf66;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">OK</span>',
            "ng": '<span style="background:#ff6b6b;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">NG</span>',
            "pending": '<span style="background:#868e96;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">未判定</span>',
        }.get(status, "")

        # サムネイル（1枚目のスクショ）
        thumb = img_to_base64(r["screenshot_1"])
        thumb_html = f'<img src="{thumb}" style="width:100%;border-radius:8px;margin-bottom:8px">' if thumb else ""

        # いいね・コメント
        likes = r["likes_count"] or "-"
        comments = r["comments_count"] or "-"
        username = r["username"] or "不明"

        # URL（Instagram/YouTube/TikTok判定）
        url = r["url"]
        if "instagram.com" in url:
            platform = "Instagram"
            platform_color = "#E1306C"
        elif "youtube.com" in url or "youtu.be" in url:
            platform = "YouTube"
            platform_color = "#FF0000"
        elif "tiktok.com" in url:
            platform = "TikTok"
            platform_color = "#000000"
        else:
            platform = "Other"
            platform_color = "#868e96"

        # 投稿日
        upload_date = r["upload_date"] if r["upload_date"] else None
        date_display = upload_date or "不明"
        # 投稿からの経過を計算
        age_label = ""
        if upload_date:
            try:
                from datetime import datetime as dt
                posted = dt.strptime(upload_date, "%Y/%m/%d")
                days = (dt.now() - posted).days
                if days <= 7:
                    age_label = "🔥 1週間以内"
                elif days <= 30:
                    age_label = f"📅 {days}日前"
                elif days <= 90:
                    age_label = f"📅 約{days//30}ヶ月前"
                else:
                    age_label = f"📅 {days//30}ヶ月以上前"
            except Exception:
                pass

        cards_html += f"""
        <div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="background:{platform_color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">{platform}</span>
            <span style="color:{star_color};font-size:14px">{stars} マッチ</span>
            {status_badge}
          </div>
          {thumb_html}
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">@{username}</div>
          <div style="display:flex;gap:12px;font-size:13px;color:#495057;margin-bottom:6px">
            <span>❤ {likes}</span>
            <span>💬 {comments}</span>
            <span>型{type_code}({type_desc})</span>
          </div>
          <div style="font-size:12px;color:#868e96;margin-bottom:4px">
            投稿日: {date_display} {age_label}
          </div>
          <a href="{url}" target="_blank" rel="noopener"
             style="display:block;background:#228be6;color:#fff;text-align:center;padding:10px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
            動画を見る →
          </a>
        </div>
        """

    # 統計
    total = len(filtered)
    ok_count = sum(1 for r in filtered if r["status"] == "ok")
    ng_count = sum(1 for r in filtered if r["status"] == "ng")
    pending_count = sum(1 for r in filtered if r["status"] == "pending")
    ig_count = sum(1 for r in filtered if "instagram.com" in r["url"])
    yt_count = sum(1 for r in filtered if "youtube.com" in r["url"])

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>リールリサーチ結果</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#f1f3f5; font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif; padding:12px; max-width:480px; margin:0 auto; }}
  .header {{ background:linear-gradient(135deg,#228be6,#7950f2); color:#fff; border-radius:12px; padding:16px; margin-bottom:12px; }}
  .header h1 {{ font-size:18px; margin-bottom:4px; }}
  .header p {{ font-size:13px; opacity:0.9; }}
  .stats {{ display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }}
  .stat {{ background:#fff; border-radius:8px; padding:8px 12px; font-size:12px; flex:1; min-width:70px; text-align:center; }}
  .stat .num {{ font-size:20px; font-weight:700; color:#228be6; }}
  .filter-bar {{ display:flex; gap:6px; margin-bottom:12px; overflow-x:auto; }}
  .filter-btn {{ background:#fff; border:1px solid #dee2e6; border-radius:20px; padding:6px 14px; font-size:12px; white-space:nowrap; cursor:pointer; }}
  .filter-btn.active {{ background:#228be6; color:#fff; border-color:#228be6; }}
  .note {{ background:#fff3cd; border-radius:8px; padding:10px; font-size:12px; color:#856404; margin-bottom:12px; }}
</style>
</head>
<body>

<div class="header">
  <h1>リールリサーチ結果</h1>
  <p>{now} 更新 ｜ 参考動画9本と類似するリールを自動収集</p>
</div>

<div class="stats">
  <div class="stat"><div class="num">{total}</div>件</div>
  <div class="stat"><div class="num">{ig_count}</div>IG</div>
  <div class="stat"><div class="num">{yt_count}</div>YT</div>
  <div class="stat"><div class="num">{pending_count}</div>未判定</div>
</div>

<div class="note">
  ★★★ = 参考動画に近い ｜ 型A = 顔なし/テキスト ｜ 型B = 顔出し/語り<br>
  「動画を見る」で元動画に飛びます。参考にしたい動画を選んでください。
</div>

{cards_html}

<div style="text-align:center;padding:20px;color:#868e96;font-size:11px">
  Generated by Reel Research Tool
</div>

</body>
</html>"""

    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"Report saved: {OUTPUT_PATH}")
    print(f"Total: {total} reels ({ig_count} IG, {yt_count} YT)")
    return str(OUTPUT_PATH)


if __name__ == "__main__":
    generate_html()
