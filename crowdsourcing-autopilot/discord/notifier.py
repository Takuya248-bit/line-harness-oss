from __future__ import annotations

import os
from typing import Optional

import httpx

from db.models import Job


def webhook_url(env_name: str = "DISCORD_WEBHOOK_UPWORK") -> Optional[str]:
    return os.environ.get(env_name)


async def notify_job(
    job: Job,
    score: int,
    *,
    job_db_id: int,
    proposal_draft: Optional[str] = None,
    proposal_count: int = 0,
) -> None:
    url = webhook_url("DISCORD_WEBHOOK_UPWORK")
    if not url:
        return
    budget = _fmt_budget(job)
    desc = (job.description or "")[:350]
    body_lines = [
        f"Platform: {job.platform}",
        f"Score: {score}",
        f"Budget: {budget}",
        f"Posted: {job.posted_at or 'unknown'}",
        f"Proposals (est.): {proposal_count}",
        "",
        desc or "(no description)",
    ]
    if proposal_draft:
        body_lines.extend(["", "--- Proposal draft ---", proposal_draft[:1500]])
    embed = {
        "title": f"{job.title[:250]}",
        "description": "\n".join(body_lines)[:4000],
        "footer": {"text": f"job_id:{job_db_id}"},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(url, json={"embeds": [embed]})


def _fmt_budget(job: Job) -> str:
    if job.budget_min is None and job.budget_max is None:
        return "n/a"
    t = job.budget_type or ""
    if job.budget_min is not None and job.budget_max is not None:
        return f"${job.budget_min}-${job.budget_max} ({t})"
    v = job.budget_max or job.budget_min
    return f"${v} ({t})"
