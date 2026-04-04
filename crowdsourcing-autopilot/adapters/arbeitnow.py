from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List

import httpx

from adapters.base import BaseAdapter
from db.models import Job

API_URL = "https://www.arbeitnow.com/api/job-board-api"

_FULLTIME_SIGNALS = frozenset(["full-time", "fulltime", "permanent"])
_FULLTIME_TITLE_SIGNALS = ("manager", "director", "head of", "vp ", "cto", "ceo")


class ArbeitnowAdapter(BaseAdapter):
    """Arbeitnow public JSON API. No auth required."""

    platform_key = "arbeitnow"

    async def fetch_jobs(self, keywords: List[str], **filters) -> List[Job]:
        try:
            return await self._fetch_jobs_impl(keywords)
        except Exception:
            return []

    async def _fetch_jobs_impl(self, keywords: List[str]) -> List[Job]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        params = {"remote": "true", "page": 1}

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(API_URL, headers=headers, params=params)
            r.raise_for_status()

        data = r.json()
        kw_lower = [k.lower() for k in keywords]

        jobs: List[Job] = []
        for item in (data.get("data") or []):
            if not isinstance(item, dict):
                continue

            title = str(item.get("title") or "")
            desc = str(item.get("description") or "")
            tags = [str(t).lower() for t in (item.get("tags") or [])]
            job_types = [str(t).lower() for t in (item.get("job_types") or [])]

            # フルタイム求人を除外
            if _FULLTIME_SIGNALS.intersection(set(tags + job_types)):
                continue
            title_l = title.lower()
            if any(sig in title_l for sig in _FULLTIME_TITLE_SIGNALS):
                continue

            # キーワードフィルタ
            if kw_lower:
                text = f"{title} {desc} {' '.join(tags)}".lower()
                if not any(kw in text for kw in kw_lower):
                    continue

            slug = str(item.get("slug") or "")
            if not slug:
                continue

            posted_at = _parse_epoch(item.get("created_at"))

            jobs.append(
                Job(
                    platform=self.platform_key,
                    external_id=slug,
                    title=title[:500],
                    description=_strip_html(desc)[:1000],
                    budget_min=None,
                    budget_max=None,
                    budget_type="fixed",
                    category=tags[0] if tags else "",
                    posted_at=posted_at,
                )
            )
        return jobs[:50]

    async def submit_proposal(self, job: Job, text: str) -> bool:
        return False

    async def deliver(self, contract_id: str, content: str) -> bool:
        return False


def _parse_epoch(v) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(v), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()
