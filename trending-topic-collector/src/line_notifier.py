from __future__ import annotations

from typing import Optional

import requests

from src.collectors.base import CollectedItem

_LINE_NOTIFY_URL = "https://notify-api.line.me/api/notify"

_ENGAGEMENT_LABELS = {
    "views": "閲覧",
    "answers": "回答",
    "faves": "いいね",
    "retweets": "RT",
    "replies": "リプ",
    "upvotes": "upvote",
    "comments": "コメント",
    "bookmarks": "ブクマ",
}

_SOURCE_LABELS = {
    "chiebukuro": "知恵袋",
    "twitter": "X",
    "youtube": "YouTube",
    "reddit": "Reddit",
    "hatena": "はてな匿名",
}


def _format_engagement(engagement: dict) -> str:
    parts = []
    for key, val in engagement.items():
        label = _ENGAGEMENT_LABELS.get(key, key)
        if isinstance(val, (int, float)):
            if val >= 10000:
                parts.append(f"{val/10000:.1f}万{label}")
            else:
                parts.append(f"{val:,}{label}")
    return " ".join(parts)


def format_notification(scored_items: list[tuple[CollectedItem, int]]) -> Optional[str]:
    if not scored_items:
        return None

    sorted_items = sorted(scored_items, key=lambda x: x[1], reverse=True)

    lines = [f"\n[バズネタ速報 {len(sorted_items)}件]\n"]
    for item, score in sorted_items:
        source_label = _SOURCE_LABELS.get(item.source, item.source)
        eng_str = _format_engagement(item.engagement)
        cat_str = f" | {item.category}" if item.category else ""
        lines.append(f"{score}点 {item.title}")
        lines.append(f"{source_label} {eng_str}{cat_str}")
        lines.append(f"{item.url}")
        lines.append("")

    return "\n".join(lines)


def send_notification(
    scored_items: list[tuple[CollectedItem, int]],
    token: str,
) -> bool:
    text = format_notification(scored_items)
    if text is None:
        return False

    chunks = []
    if len(text) <= 1000:
        chunks = [text]
    else:
        header = f"\n[バズネタ速報 {len(scored_items)}件]\n\n"
        current = header
        sorted_items = sorted(scored_items, key=lambda x: x[1], reverse=True)
        for item, score in sorted_items:
            source_label = _SOURCE_LABELS.get(item.source, item.source)
            eng_str = _format_engagement(item.engagement)
            cat_str = f" | {item.category}" if item.category else ""
            entry = f"{score}点 {item.title}\n{source_label} {eng_str}{cat_str}\n{item.url}\n\n"
            if len(current) + len(entry) > 950:
                chunks.append(current)
                current = entry
            else:
                current += entry
        if current.strip():
            chunks.append(current)

    for chunk in chunks:
        resp = requests.post(
            _LINE_NOTIFY_URL,
            headers={"Authorization": f"Bearer {token}"},
            data={"message": chunk},
        )
        if resp.status_code != 200:
            print(f"LINE Notify error: {resp.status_code} {resp.text}")
            return False

    return True
