from __future__ import annotations

from typing import List

from adapters.base import BaseAdapter
from db.models import Job


class AppenAdapter(BaseAdapter):
    platform_key = "appen"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        return [
            Job(
                platform=self.platform_key,
                external_id="rlhf-appen-skeleton",
                title="Appen task (skeleton; configure session or Lightpanda)",
                category="rlhf",
            )
        ]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
