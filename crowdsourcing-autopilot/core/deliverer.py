from __future__ import annotations

from db.models import Deliverable, Job


async def deliver_for_job(job: Job, content: str) -> Deliverable:
    """
    Placeholder delivery pipeline (translation / RLHF branches in later phases).
    """
    return Deliverable(contract_id=0, content=content, review_status="pending")
