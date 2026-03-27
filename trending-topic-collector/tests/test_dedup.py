import os
import tempfile

import pytest

from src.dedup import DedupDB


@pytest.fixture
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    d = DedupDB(path)
    yield d
    d.close()
    os.unlink(path)


def test_first_url_is_not_seen(db):
    assert not db.is_seen("https://example.com/1")


def test_mark_seen_then_is_seen(db):
    db.mark_seen("https://example.com/1", "test title", "reddit")
    assert db.is_seen("https://example.com/1")


def test_different_url_not_seen(db):
    db.mark_seen("https://example.com/1", "test title", "reddit")
    assert not db.is_seen("https://example.com/2")


def test_cleanup_removes_old_entries(db):
    from datetime import datetime, timedelta

    db.mark_seen("https://example.com/old", "old", "reddit")
    old_ts = (datetime.now() - timedelta(days=31)).isoformat()
    db._conn.execute(
        "UPDATE seen SET first_seen_at = ? WHERE url = ?",
        (old_ts, "https://example.com/old"),
    )
    db._conn.commit()
    db.mark_seen("https://example.com/new", "new", "reddit")

    db.cleanup(max_age_days=30)
    assert not db.is_seen("https://example.com/old")
    assert db.is_seen("https://example.com/new")
