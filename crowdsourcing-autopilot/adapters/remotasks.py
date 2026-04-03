from __future__ import annotations

import os
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job


class RemotasksAdapter(BaseAdapter):
    platform_key = "remotasks"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        api = os.environ.get(
            "REMOTASKS_API_BASE", "https://www.remotasks.com/api/v1"
        )
        headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        ck = os.environ.get("REMOTASKS_COOKIE", "")
        if ck:
            headers["Cookie"] = ck
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(f"{api}/tasks", headers=headers)
                if r.status_code < 400:
                    j = r.json()
                    if isinstance(j, list):
                        return [
                            Job(
                                platform=self.platform_key,
                                external_id=str(
                                    it.get("id") or it.get("uid") or idx
                                ),
                                title=str(it.get("title") or "Remo task"),
                                category="rlhf",
                            )
                            for idx, it in enumerate(j[:20])
                            if isinstance(it, dict)
                        ]
        except OSError:
            pass
        return [
            Job(
                platform=self.platform_key,
                external_id="rlhf-placeholder",
                title="Remotasks RLHF task (placeholder)",
                category="rlhf",
            )
        ]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
