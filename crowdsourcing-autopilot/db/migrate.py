"""Apply SQLite schema for crowdsourcing-autopilot."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT / "data" / "app.db"

# Schema aligned with design doc table names (spec file not present in repo at T1).
SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    url TEXT,
    budget_min REAL,
    budget_max REAL,
    currency TEXT NOT NULL DEFAULT 'JPY',
    status TEXT NOT NULL DEFAULT 'open',
    raw_html TEXT,
    metadata_json TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS proposal_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT,
    body_template TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES proposal_templates(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    proposal_id INTEGER REFERENCES proposals(id),
    platform_contract_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    agreed_price REAL,
    currency TEXT NOT NULL DEFAULT 'JPY',
    agreed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deliverables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def migrate(db_path: Path | None = None) -> Path:
    path = db_path or DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()
    return path


def main() -> None:
    path = migrate()
    print(f"OK: schema applied to {path}")


if __name__ == "__main__":
    main()
