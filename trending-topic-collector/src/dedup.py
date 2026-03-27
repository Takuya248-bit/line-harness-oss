from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


class DedupDB:
    """URL単位の重複排除。SQLiteで管理。"""

    def __init__(self, db_path: str | Path = "data/seen.db"):
        self._conn = sqlite3.connect(str(db_path))
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS seen (
                url TEXT PRIMARY KEY,
                title TEXT,
                source TEXT,
                first_seen_at TEXT
            )
        """)
        self._conn.commit()

    def is_seen(self, url: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM seen WHERE url = ?", (url,)
        ).fetchone()
        return row is not None

    def mark_seen(self, url: str, title: str, source: str) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO seen (url, title, source, first_seen_at) VALUES (?, ?, ?, ?)",
            (url, title, source, datetime.now().isoformat()),
        )
        self._conn.commit()

    def cleanup(self, max_age_days: int = 30) -> int:
        cutoff = (datetime.now() - timedelta(days=max_age_days)).isoformat()
        cur = self._conn.execute(
            "DELETE FROM seen WHERE first_seen_at < ?", (cutoff,)
        )
        self._conn.commit()
        return cur.rowcount

    def close(self) -> None:
        self._conn.close()
