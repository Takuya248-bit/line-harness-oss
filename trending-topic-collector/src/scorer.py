from __future__ import annotations

import re

from src.collectors.base import CollectedItem

_BUZZ_SCALES: dict[str, tuple[str, float, float, float]] = {
    "chiebukuro": ("views", 10_000, 50_000, 100_000),
    "twitter": ("faves", 5_000, 20_000, 50_000),
    "youtube": ("views", 100_000, 500_000, 1_000_000),
    "reddit": ("upvotes", 500, 2_000, 5_000),
    "hatena": ("bookmarks", 100, 500, 1_000),
}

_EMOTION_WORDS = re.compile(
    r"怒り|悲し|驚き|感動|モヤモヤ|衝撃|ショック|泣い|泣け|許せ|信じられ|ヤバい|ヤバ|つらい|辛い|最悪|最高|号泣|激怒|困惑"
)
_QUESTION_PATTERNS = re.compile(
    r"どう思[うい]|ってあり|なんだけど|どうすれば|どうしたら|ですか[？?]|でしょうか|してる[？?]|だと思う[？?]|知りたい"
)
_RELATIONSHIP_WORDS = re.compile(
    r"恋愛|彼氏|彼女|夫|妻|旦那|嫁|義母|義父|上司|部下|同僚|職場|友人|友達|家族|親|子供|国際|外国人|海外"
)
_CONTROVERSY_WORDS = re.compile(
    r"賛否|炎上|批判|擁護|反論|議論|意見が割れ|どっちが正しい|おかしい|非常識|常識"
)


def _buzz_score(item: CollectedItem) -> float:
    scale = _BUZZ_SCALES.get(item.source)
    if not scale:
        return 0.0
    key, low, mid, high = scale
    value = item.engagement.get(key, 0)
    if not value:
        return 0.0
    if value <= low:
        return (value / low) * 20
    elif value <= mid:
        return 20 + ((value - low) / (mid - low)) * 20
    elif value <= high:
        return 40 + ((value - mid) / (high - mid)) * 20
    else:
        return 60.0


def _topic_score(item: CollectedItem) -> float:
    text = f"{item.title} {item.body_snippet}"
    score = 0.0
    if _EMOTION_WORDS.search(text):
        score += 10
    if _QUESTION_PATTERNS.search(text):
        score += 10
    if _RELATIONSHIP_WORDS.search(text):
        score += 10
    if _CONTROVERSY_WORDS.search(text):
        score += 10
    return score


def score_item(item: CollectedItem) -> int:
    buzz = _buzz_score(item)
    topic = _topic_score(item)
    return int(min(buzz + topic, 100))
