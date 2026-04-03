from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import aiosqlite
import httpx

from db.migrate import default_db_path
from discord.notifier import webhook_url


async def daily_summary(db_path: Path | None = None) -> dict:
    path = db_path or default_db_path()
    today = date.today().isoformat()
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT COUNT(*) AS c FROM contracts WHERE status = 'active'"
        )
        active = int((await cur.fetchone())["c"])
        cur = await db.execute(
            """
            SELECT COUNT(*) AS c FROM contracts
            WHERE status = 'active' AND deadline = ?
            """,
            (today,),
        )
        due_today = int((await cur.fetchone())["c"])
    return {
        "active_contracts": active,
        "due_today": due_today,
        "revenue_today_usd": 0.0,
    }


async def weekly_summary(db_path: Path | None = None) -> dict:
    path = db_path or default_db_path()
    start = (date.today() - timedelta(days=7)).isoformat()
    platform_counts: dict[str, int] = defaultdict(int)
    wins = 0
    proposals = 0
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT platform, COUNT(*) AS c FROM jobs WHERE scanned_at >= ? GROUP BY platform",
            (start,),
        )
        for r in await cur.fetchall():
            platform_counts[r["platform"]] = int(r["c"])
        cur = await db.execute(
            "SELECT COUNT(*) AS c FROM proposals WHERE created_at >= ?", (start,)
        )
        proposals = int((await cur.fetchone())["c"])
        cur = await db.execute(
            "SELECT COUNT(*) AS c FROM proposals WHERE status = 'accepted' AND created_at >= ?",
            (start,),
        )
        wins = int((await cur.fetchone())["c"])
    win_rate = (wins / proposals * 100) if proposals else 0.0
    return {
        "revenue_week_usd": 0.0,
        "jobs_scanned_by_platform": dict(platform_counts),
        "proposals": proposals,
        "win_rate_pct": round(win_rate, 1),
    }


async def send_daily_report(db_path: Path | None = None) -> None:
    s = await daily_summary(db_path)
    url = webhook_url("DISCORD_WEBHOOK_UPWORK")
    if not url:
        return
    embed = {
        "title": "Daily report",
        "fields": [
            {"name": "Active contracts", "value": str(s["active_contracts"])},
            {"name": "Due today", "value": str(s["due_today"])},
            {"name": "Revenue today (USD)", "value": str(s["revenue_today_usd"])},
        ],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(url, json={"embeds": [embed]})


async def send_weekly_report(db_path: Path | None = None) -> None:
    s = await weekly_summary(db_path)
    url = webhook_url("DISCORD_WEBHOOK_UPWORK")
    if not url:
        return
    lines = [f"{k}: {v}" for k, v in s["jobs_scanned_by_platform"].items()]
    embed = {
        "title": "Weekly report",
        "description": "\n".join(lines) if lines else "No platform breakdown",
        "fields": [
            {"name": "Proposals", "value": str(s["proposals"])},
            {"name": "Win rate %", "value": str(s["win_rate_pct"])},
            {"name": "Revenue week (USD)", "value": str(s["revenue_week_usd"])},
        ],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(url, json={"embeds": [embed]})


async def run_report(period: str = "daily") -> None:
    if period == "weekly":
        await send_weekly_report()
    else:
        await send_daily_report()
