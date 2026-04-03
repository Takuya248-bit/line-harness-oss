from __future__ import annotations

import os
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job


class DataAnnotationAdapter(BaseAdapter):
    platform_key = "dataannotation"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        url = os.environ.get(
            "DATAANNOTATION_TASKS_URL",
            "https://www.dataannotation.example/api/tasks",
        )
        headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        ck = os.environ.get("DATAANNOTATION_COOKIE", "")
        if ck:
            headers["Cookie"] = ck
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(url, headers=headers)
                if r.status_code < 400 and r.headers.get("content-type", "").startswith(
                    "application/json"
                ):
                    data = r.json()
                    if isinstance(data, list):
                        return [
                            Job(
                                platform=self.platform_key,
                                external_id=str(
                                    item.get("id") or item.get("task_id") or i
                                ),
                                title=str(item.get("title") or "RLHF task"),
                                category="rlhf",
                            )
                            for i, item in enumerate(data[:20])
                            if isinstance(item, dict)
                        ]
        except OSError:
            pass
        return [
            Job(
                platform=self.platform_key,
                external_id="rlhf-skeleton",
                title="DataAnnotation RLHF task (skeleton)",
                category="rlhf",
            )
        ]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
