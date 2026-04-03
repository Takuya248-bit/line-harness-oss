from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import aiosqlite

from db.migrate import default_db_path
from db.models import Job


async def job_exists(db_path: Path, platform: str, external_id: str) -> bool:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            "SELECT 1 FROM jobs WHERE platform = ? AND external_id = ? LIMIT 1",
            (platform, external_id),
        )
        row = await cur.fetchone()
        return row is not None


async def insert_job(db_path: Path, job: Job) -> int:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """
            INSERT INTO jobs (
              platform, external_id, title, description,
              budget_min, budget_max, budget_type, category,
              score, status, posted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.platform,
                job.external_id,
                job.title,
                job.description,
                job.budget_min,
                job.budget_max,
                job.budget_type,
                job.category,
                job.score,
                job.status,
                _iso(job.posted_at),
            ),
        )
        await db.commit()
        return int(cur.lastrowid)


async def update_job_score_and_status(
    db_path: Path, job_id: int, score: int, status: str
) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE jobs SET score = ?, status = ? WHERE id = ?",
            (score, status, job_id),
        )
        await db.commit()


async def record_skip(db_path: Path, job_id: int, _reason: str = "") -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE jobs SET status = 'skipped' WHERE id = ?",
            (job_id,),
        )
        await db.commit()


async def fetch_proposal_templates(
    db_path: Path, platform: str, category: Optional[str], limit: int = 5
) -> list[Tuple[str, bool]]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        if category:
            cur = await db.execute(
                """
                SELECT text, was_accepted FROM proposal_templates
                WHERE platform = ? AND (category = ? OR category IS NULL)
                ORDER BY was_accepted DESC, id DESC
                LIMIT ?
                """,
                (platform, category, limit),
            )
        else:
            cur = await db.execute(
                """
                SELECT text, was_accepted FROM proposal_templates
                WHERE platform = ? OR platform IS NULL
                ORDER BY was_accepted DESC, id DESC
                LIMIT ?
                """,
                (platform, limit),
            )
        rows = await cur.fetchall()
        return [(str(r["text"]), bool(r["was_accepted"])) for r in rows]


async def get_job_by_id(db_path: Path, job_id: int) -> Optional[aiosqlite.Row]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return await cur.fetchone()


async def insert_proposal_draft(db_path: Path, job_id: int, text: str) -> int:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            "INSERT INTO proposals (job_id, text, status) VALUES (?, ?, 'draft')",
            (job_id, text),
        )
        await db.commit()
        return int(cur.lastrowid)


async def mark_proposal_sent(db_path: Path, proposal_id: int) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE proposals SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
            (proposal_id,),
        )
        await db.commit()


async def latest_draft_for_job(db_path: Path, job_id: int) -> Optional[Tuple[int, str]]:
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """
            SELECT id, text FROM proposals
            WHERE job_id = ? AND status = 'draft'
            ORDER BY id DESC LIMIT 1
            """,
            (job_id,),
        )
        row = await cur.fetchone()
        if not row:
            return None
        return int(row[0]), str(row[1])


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat()
