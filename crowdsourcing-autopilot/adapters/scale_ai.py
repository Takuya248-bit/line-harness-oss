from __future__ import annotations

import os
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job


class ScaleAIAdapter(BaseAdapter):
    platform_key = "scale_ai"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        base = os.environ.get("SCALE_AI_BASE_URL", "https://remotasks.example")
        token = os.environ.get("SCALE_AI_SESSION", "")
        headers = {"User-Agent": "CrowdsourcingAutopilot/1.0"}
        if token:
            headers["Cookie"] = token
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
                r = await c.get(f"{base}/api/tasks", headers=headers)
                if r.status_code < 400 and r.headers.get(
                    "content-type", ""
                ).startswith("application/json"):
                    data = r.json()
                    if isinstance(data, list):
                        return [
                            Job(
                                platform=self.platform_key,
                                external_id=str(
                                    row.get("id") or row.get("task_id") or i
                                ),
                                title=str(row.get("title") or "Scale task"),
                                category="rlhf",
                            )
                            for i, row in enumerate(data[:20])
                            if isinstance(row, dict)
                        ]
        except OSError:
            pass
        return [
            Job(
                platform=self.platform_key,
                external_id="rlhf-placeholder",
                title="RLHF / evaluation task (placeholder)",
                description="Register account and configure internal API.",
                category="rlhf",
            )
        ]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False
