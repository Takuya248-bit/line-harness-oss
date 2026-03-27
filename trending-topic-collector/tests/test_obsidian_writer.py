import os
import tempfile
from datetime import datetime

from src.collectors.base import CollectedItem
from src.obsidian_writer import write_topic_note, _slugify


def test_slugify():
    assert _slugify("彼氏が海外赴任 ついていくべき？") == "彼氏が海外赴任-ついていくべき"
    assert _slugify("What do you think?") == "what-do-you-think"


def test_write_creates_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        item = CollectedItem(
            title="テストトピック",
            url="https://example.com/topic1",
            source="chiebukuro",
            body_snippet="これはテスト本文です。",
            category="恋愛相談",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"views": 50000, "answers": 20},
        )
        path = write_topic_note(item, score=75, output_dir=tmpdir)

        assert os.path.exists(path)
        content = open(path, encoding="utf-8").read()
        assert "title:" in content
        assert "score: 75" in content
        assert "https://example.com/topic1" in content
        assert "テストトピック" in content
        assert "trending-topic" in content


def test_write_no_duplicate_filename():
    with tempfile.TemporaryDirectory() as tmpdir:
        item = CollectedItem(
            title="同じタイトル", url="https://a.com", source="reddit",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"upvotes": 1000},
        )
        p1 = write_topic_note(item, score=60, output_dir=tmpdir)
        item2 = CollectedItem(
            title="同じタイトル", url="https://b.com", source="reddit",
            collected_at=datetime(2026, 3, 28, 9, 0, 0),
            engagement={"upvotes": 2000},
        )
        p2 = write_topic_note(item2, score=65, output_dir=tmpdir)
        assert p1 != p2
        assert os.path.exists(p1)
        assert os.path.exists(p2)
