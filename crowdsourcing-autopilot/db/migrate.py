"""Create SQLite schema. Run: python -m db.migrate"""

from __future__ import annotations

import asyncio
from pathlib import Path

import aiosqlite

DDL = """
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  budget_min REAL,
  budget_max REAL,
  budget_type TEXT,
  category TEXT,
  score INTEGER,
  status TEXT DEFAULT 'new',
  posted_at TEXT,
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  text TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  sent_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  rate REAL,
  rate_type TEXT,
  deadline TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliverables (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id),
  content TEXT,
  review_status TEXT DEFAULT 'pending',
  submitted_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposal_templates (
  id INTEGER PRIMARY KEY,
  platform TEXT,
  category TEXT,
  text TEXT NOT NULL,
  was_accepted BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def default_db_path() -> Path:
    root = Path(__file__).resolve().parent.parent
    data = root / "data"
    data.mkdir(parents=True, exist_ok=True)
    return data / "autopilot.db"


async def migrate(db_path: Path | None = None) -> Path:
    path = db_path or default_db_path()
    async with aiosqlite.connect(path) as db:
        await db.executescript(DDL)
        await db.commit()
    return path


def main() -> None:
    path = asyncio.run(migrate())
    print(f"OK: schema applied at {path}")


if __name__ == "__main__":
    main()
