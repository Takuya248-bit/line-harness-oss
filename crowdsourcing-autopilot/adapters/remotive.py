from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job

API_URL = "https://remotive.com/api/remote-jobs"

_FULLTIME_JOB_TYPES = frozenset(["full_time", "full-time"])


class RemotiveAdapter(BaseAdapter):
    """Remotive public JSON API. No auth required."""

    platform_key = "remotive"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        params: dict = {"limit": 100}

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(API_URL, headers=headers, params=params)
            r.raise_for_status()

        data = r.json()
        kw_lower = [k.lower() for k in keywords]

        jobs: List[Job] = []
        for item in (data.get("jobs") or []):
            if not isinstance(item, dict):
                continue

            title = str(item.get("title") or "")
            desc = str(item.get("description") or "")
            job_type = str(item.get("job_type") or "").lower()
            tags = [str(t).lower() for t in (item.get("tags") or [])]

            # フルタイム求人を除外（job_typeのみで判定）
            if job_type in _FULLTIME_JOB_TYPES:
                continue

            # キーワードフィルタ（緩め: いずれか1語でもヒットすれば通す）
            if kw_lower:
                text = f"{title} {desc} {' '.join(tags)}".lower()
                if not any(kw in text for kw in kw_lower):
                    # キーワード完全不一致でも contract/part_time は通す
                    if job_type not in ("contract", "part_time", "freelance"):
                        continue

            eid = str(item.get("id") or "")
            if not eid:
                continue

            posted_at = _parse_iso(item.get("publication_date"))
            category = str(item.get("category") or "")

            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=eid,
                    title=title[:500],
                    description=_strip_html(desc)[:1000],
                    budget_min=None,
                    budget_max=None,
                    budget_type="fixed",
                    category=category,
                    posted_at=posted_at,
                )
            )
        return jobs[:50]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_iso(v) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()
