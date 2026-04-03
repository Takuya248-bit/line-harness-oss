from __future__ import annotations

import os
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job


class FreelancerComAdapter(BaseAdapter):
    """Freelancer.com REST API + OAuth2 (skeleton)."""

    platform_key = "freelancer"
    AUTH_URL = "https://www.freelancer.com/api/auth/authorize"
    TOKEN_URL = "https://www.freelancer.com/api/auth/token"
    API_BASE = "https://www.freelancer.com/api/projects/0.1"

    def __init__(self) -> None:
        self._client_id = os.environ.get("FREELANCER_CLIENT_ID", "")
        self._client_secret = os.environ.get("FREELANCER_CLIENT_SECRET", "")

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        if not self._client_id:
            return []
        token = os.environ.get("FREELANCER_ACCESS_TOKEN", "")
        if not token:
            return []
        q = " ".join(keywords[:3])
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(
                f"{self.API_BASE}/projects/active/",
                params={"query": q, "limit": 20},
                headers={"Freelancer-OAuth-V1": token},
            )
            if r.status_code >= 400:
                return []
            payload = r.json().get("result") or {}
            projects = payload.get("projects") or []
        jobs: List[Job] = []
        for p in projects:
            jid = str(p.get("id") or "")
            if not jid:
                continue
            budget = p.get("budget") or {}
            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=jid,
                    title=str(p.get("title") or ""),
                    description=p.get("preview_description"),
                    budget_min=_f(budget.get("minimum")),
                    budget_max=_f(budget.get("maximum")),
                    budget_type="hourly"
                    if int(p.get("hourly_project") or 0)
                    else "fixed",
                    category="tech",
                )
            )
        return jobs

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _f(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None
