from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Callable, Dict, List

import yaml

from adapters.appen import AppenAdapter
from adapters.coconala import CoconalaAdapter
from adapters.crowdworks import CrowdWorksAdapter
from adapters.dataannotation import DataAnnotationAdapter
from adapters.fiverr import FiverrAdapter
from adapters.freelancer_com import FreelancerComAdapter
from adapters.lancers import LancersAdapter
from adapters.remotasks import RemotasksAdapter
from adapters.scale_ai import ScaleAIAdapter
from adapters.upwork import UpworkAdapter
from adapters.remoteok import RemoteOKAdapter
from db.migrate import default_db_path
from db.models import Job
from db.queries import (
    insert_job,
    insert_proposal_draft,
    job_exists,
    update_job_score_and_status,
)
from discord.notifier import notify_job
from core.proposer import generate_proposal
from core.scorer import score_job

ADAPTER_FACTORIES: Dict[str, Callable[[], Any]] = {
    "upwork": UpworkAdapter,
    "remoteok": RemoteOKAdapter,
    "crowdworks": CrowdWorksAdapter,
    "lancers": LancersAdapter,
    "freelancer": FreelancerComAdapter,
    "fiverr": FiverrAdapter,
    "coconala": CoconalaAdapter,
    "scale_ai": ScaleAIAdapter,
    "dataannotation": DataAnnotationAdapter,
    "remotasks": RemotasksAdapter,
    "appen": AppenAdapter,
}


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _keyword_match(job: Job, keywords: List[str]) -> bool:
    hay = f"{job.title or ''} {job.description or ''}".lower()
    return any(k.lower() in hay for k in keywords)


def _budget_ok(job: Job, budget_cfg: dict) -> bool:
    hourly_floor = float(budget_cfg.get("hourly") or 0)
    fixed_floor = float(budget_cfg.get("fixed") or 0)
    ref = job.budget_max or job.budget_min
    if ref is None:
        return True  # 予算不明は通す（スコアリングで判断）
    if job.budget_type == "hourly":
        return ref >= hourly_floor
    return ref >= fixed_floor


async def run_scan() -> None:
    root = Path(__file__).resolve().parent.parent
    scan = _load_yaml(root / "config" / "scan.yaml")
    platforms_cfg = _load_yaml(root / "config" / "platforms.yaml")
    db_path = default_db_path()

    keywords: List[str] = list(scan.get("keywords") or [])
    exclude: List[str] = list(scan.get("exclude_keywords") or [])
    budget_cfg = dict(scan.get("budget_min") or {})
    thresholds = dict(scan.get("thresholds") or {"high": 70, "maybe": 50})
    high = int(thresholds.get("high", 70))
    maybe = int(thresholds.get("maybe", 50))

    tasks = []
    labels: List[str] = []
    for name, cfg in (platforms_cfg.get("platforms") or {}).items():
        if not cfg.get("enabled", False):
            continue
        factory = ADAPTER_FACTORIES.get(name)
        if not factory:
            continue
        adapter = factory()
        tasks.append(adapter.fetch_jobs(keywords))
        labels.append(name)

    results = await asyncio.gather(*tasks, return_exceptions=True)
    jobs: List[Job] = []
    for label, res in zip(labels, results):
        if isinstance(res, Exception):
            print(f"[{label}] fetch error: {res}")
            continue
        jobs.extend(res)

    processed = 0
    for job in jobs:
        if keywords and not _keyword_match(job, keywords):
            continue
        if exclude and _keyword_match(job, exclude):
            continue
        if not _budget_ok(job, budget_cfg):
            continue
        if await job_exists(db_path, job.platform, job.external_id):
            continue
        job_id = await insert_job(db_path, job)
        job.id = job_id
        try:
            scored = await score_job(job)
        except Exception as exc:
            print(f"score_job failed for {job.platform}/{job.external_id}: {exc}")
            scored = {"score": 0}
        score = int(scored.get("score") or 0)

        if score < maybe:
            await update_job_score_and_status(db_path, job_id, score, "skipped")
            continue

        proposal_text = None
        if score >= high:
            try:
                proposal_text = await generate_proposal(job, db_path)
                await insert_proposal_draft(db_path, job_id, proposal_text)
            except Exception as exc:
                print(f"generate_proposal failed: {exc}")

        await update_job_score_and_status(db_path, job_id, score, "notified")
        await notify_job(
            job,
            score,
            job_db_id=job_id,
            proposal_draft=proposal_text,
            proposal_count=0,
        )
        processed += 1

    print(f"Scan complete; notified/processed pipeline for {processed} new jobs.")
