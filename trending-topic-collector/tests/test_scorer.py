from src.collectors.base import CollectedItem
from src.scorer import score_item


def test_high_engagement_chiebukuro():
    item = CollectedItem(
        title="彼氏が海外赴任 ついていくべき？",
        url="https://example.com",
        source="chiebukuro",
        body_snippet="付き合って3年の彼氏が...",
        engagement={"views": 100000, "answers": 47},
    )
    s = score_item(item)
    assert s >= 70


def test_low_engagement_reddit():
    item = CollectedItem(
        title="Random post about nothing",
        url="https://example.com",
        source="reddit",
        body_snippet="Just a random thought.",
        engagement={"upvotes": 500},
    )
    s = score_item(item)
    assert s < 50


def test_medium_hatena_with_emotion():
    item = CollectedItem(
        title="職場で言われた衝撃の一言にモヤモヤが止まらない",
        url="https://example.com",
        source="hatena",
        body_snippet="上司に呼ばれて...",
        engagement={"bookmarks": 500},
    )
    s = score_item(item)
    assert 50 <= s <= 85


def test_buzz_score_linear_interpolation():
    item_low = CollectedItem(
        title="test", url="https://a.com", source="chiebukuro",
        engagement={"views": 10000},
    )
    item_mid = CollectedItem(
        title="test", url="https://b.com", source="chiebukuro",
        engagement={"views": 50000},
    )
    item_high = CollectedItem(
        title="test", url="https://c.com", source="chiebukuro",
        engagement={"views": 100000},
    )
    s_low = score_item(item_low)
    s_mid = score_item(item_mid)
    s_high = score_item(item_high)
    assert s_low < s_mid < s_high


def test_question_format_bonus():
    item_plain = CollectedItem(
        title="海外生活の話", url="https://a.com", source="chiebukuro",
        engagement={"views": 30000, "answers": 10},
    )
    item_question = CollectedItem(
        title="海外生活ってどう思う？", url="https://b.com", source="chiebukuro",
        engagement={"views": 30000, "answers": 10},
    )
    assert score_item(item_question) > score_item(item_plain)
