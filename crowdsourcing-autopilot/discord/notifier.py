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
    link = _job_url(job)
    body_lines = [
        f"Platform: {job.platform}",
        f"Score: {score}",
        f"Budget: {budget}",
        f"Posted: {job.posted_at or 'unknown'}",
        f"Proposals (est.): {proposal_count}",
        "",
        desc or "(no description)",
    ]
    if link:
        body_lines.insert(0, f"[案件リンク]({link})")
    if proposal_draft:
        body_lines.extend(["", "--- Proposal draft ---", proposal_draft[:1500]])
    embed = {
        "title": f"{job.title[:250]}",
        "url": link or "",
        "description": "\n".join(body_lines)[:4000],
        "footer": {"text": f"job_id:{job_db_id}"},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(url, json={"embeds": [embed]})


JA_PLATFORMS = {"crowdworks", "lancers", "coconala"}

_PLATFORM_URLS = {
    "crowdworks": "https://crowdworks.jp/public/jobs/{eid}",
    "coconala": "https://coconala.com/requests/{eid}",
    "lancers": "https://www.lancers.jp/work/detail/{eid}",
    "upwork": "https://www.upwork.com/jobs/~{eid}",
    "remoteok": "https://remoteok.com/remote-jobs/{eid}",
}


def _job_url(job: Job) -> str:
    tpl = _PLATFORM_URLS.get(job.platform, "")
    return tpl.format(eid=job.external_id) if tpl else ""


def _fmt_budget(job: Job) -> str:
    if job.budget_min is None and job.budget_max is None:
        return "n/a"
    t = job.budget_type or ""
    cur = "¥" if job.platform in JA_PLATFORMS else "$"
    if job.budget_min is not None and job.budget_max is not None:
        return f"{cur}{job.budget_min:,.0f}〜{cur}{job.budget_max:,.0f} ({t})"
    v = job.budget_max or job.budget_min
    return f"{cur}{v:,.0f} ({t})"
