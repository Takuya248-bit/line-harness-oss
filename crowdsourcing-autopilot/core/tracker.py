from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import List

import aiosqlite

from db.migrate import default_db_path


async def update_status(
    db_path: Path, job_id: int, new_status: str
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute("UPDATE jobs SET status = ? WHERE id = ?", (new_status, job_id))
        await db.commit()


async def get_active_contracts(db_path: Path | None = None) -> List[dict]:
    path = db_path or default_db_path()
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM contracts WHERE status = 'active' ORDER BY id DESC"
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_deadlines(
    db_path: Path | None = None, within_days: int = 14
) -> List[dict]:
    path = db_path or default_db_path()
    today = date.today()
    end = (today + timedelta(days=within_days)).isoformat()
    start = today.isoformat()
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """
            SELECT * FROM contracts
            WHERE status = 'active' AND deadline IS NOT NULL
              AND deadline >= ? AND deadline <= ?
            ORDER BY deadline ASC
            LIMIT 100
            """,
            (start, end),
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]
