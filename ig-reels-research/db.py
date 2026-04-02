"""SQLiteデータベース管理"""
import sqlite3
from pathlib import Path
from config import DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT UNIQUE NOT NULL,
            username TEXT,
            screenshot_1 TEXT,
            screenshot_2 TEXT,
            screenshot_3 TEXT,
            score_type_a REAL DEFAULT 0.0,
            score_type_b REAL DEFAULT 0.0,
            likes_count TEXT,
            comments_count TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ok', 'ng')),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reference_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('a', 'b')),
            file_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()


def insert_reel(url: str, username: str = None,
                screenshots: list[str] = None,
                score_a: float = 0.0, score_b: float = 0.0,
                likes: str = None, comments: str = None) -> int:
    conn = get_connection()
    ss = screenshots or [None, None, None]
    cur = conn.execute("""
        INSERT OR IGNORE INTO reels (url, username, screenshot_1, screenshot_2, screenshot_3,
            score_type_a, score_type_b, likes_count, comments_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (url, username, ss[0] if len(ss) > 0 else None,
          ss[1] if len(ss) > 1 else None, ss[2] if len(ss) > 2 else None,
          score_a, score_b, likes, comments))
    conn.commit()
    reel_id = cur.lastrowid
    conn.close()
    return reel_id


def update_reel_status(reel_id: int, status: str, notes: str = None):
    conn = get_connection()
    conn.execute("UPDATE reels SET status = ?, notes = ? WHERE id = ?",
                 (status, notes, reel_id))
    conn.commit()
    conn.close()


def update_reel_scores(reel_id: int, score_a: float, score_b: float):
    conn = get_connection()
    conn.execute("UPDATE reels SET score_type_a = ?, score_type_b = ? WHERE id = ?",
                 (score_a, score_b, reel_id))
    conn.commit()
    conn.close()


def get_pending_reels():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM reels WHERE status = 'pending' ORDER BY score_type_a + score_type_b DESC"
    ).fetchall()
    conn.close()
    return rows


def get_all_reels():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM reels ORDER BY created_at DESC").fetchall()
    conn.close()
    return rows


def reel_exists(url: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM reels WHERE url = ?", (url,)).fetchone()
    conn.close()
    return row is not None


def register_reference(type_: str, file_path: str):
    conn = get_connection()
    conn.execute("INSERT INTO reference_images (type, file_path) VALUES (?, ?)",
                 (type_, file_path))
    conn.commit()
    conn.close()


def get_reference_images(type_: str):
    conn = get_connection()
    rows = conn.execute(
        "SELECT file_path FROM reference_images WHERE type = ?", (type_,)
    ).fetchall()
    conn.close()
    return [r["file_path"] for r in rows]
