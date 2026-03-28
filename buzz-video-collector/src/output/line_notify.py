from __future__ import annotations
from typing import Optional
import requests
from src.output.csv_export import ScoredVideo

_LINE_NOTIFY_URL = "https://notify-api.line.me/api/notify"
_SOURCE_LABELS = {"ig_reels": "IG", "yt_shorts": "YT"}

def _format_counts(item) -> str:
    parts = []
    if item.views:
        v = f"{item.views/10000:.1f}万" if item.views >= 10000 else f"{item.views:,}"
        parts.append(f"{v}再生")
    if item.likes:
        v = f"{item.likes/10000:.1f}万" if item.likes >= 10000 else f"{item.likes:,}"
        parts.append(f"{v}いいね")
    return " ".join(parts)

def format_notification(scored: list[ScoredVideo]) -> Optional[str]:
    if not scored:
        return None
    sorted_sv = sorted(scored, key=lambda sv: sv.text.total_score, reverse=True)
    lines = [f"\n[バズ動画ネタ速報 {len(sorted_sv)}件]\n"]
    for sv in sorted_sv:
        src = _SOURCE_LABELS.get(sv.item.source, sv.item.source)
        counts = _format_counts(sv.item)
        fmt = f" [{sv.visual.format}]" if sv.visual else ""
        lines.append(f"{sv.text.total_score}点 {sv.text.summary}")
        lines.append(f"{src} {counts}{fmt}")
        lines.append(f"{sv.item.url}")
        lines.append("")
    return "\n".join(lines)

def send_notification(scored: list[ScoredVideo], token: str) -> bool:
    text = format_notification(scored)
    if text is None:
        return False
    chunks = []
    if len(text) <= 1000:
        chunks = [text]
    else:
        current = f"\n[バズ動画ネタ速報 {len(scored)}件]\n\n"
        sorted_sv = sorted(scored, key=lambda sv: sv.text.total_score, reverse=True)
        for sv in sorted_sv:
            src = _SOURCE_LABELS.get(sv.item.source, sv.item.source)
            counts = _format_counts(sv.item)
            fmt = f" [{sv.visual.format}]" if sv.visual else ""
            entry = f"{sv.text.total_score}点 {sv.text.summary}\n{src} {counts}{fmt}\n{sv.item.url}\n\n"
            if len(current) + len(entry) > 950:
                chunks.append(current)
                current = entry
            else:
                current += entry
        if current.strip():
            chunks.append(current)
    for chunk in chunks:
        resp = requests.post(_LINE_NOTIFY_URL, headers={"Authorization": f"Bearer {token}"}, data={"message": chunk})
        if resp.status_code != 200:
            print(f"LINE Notify error: {resp.status_code} {resp.text}")
            return False
    return True
